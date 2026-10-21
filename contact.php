<?php
/* ============================================================
   AFTERGLOW BY KEVIN — Endpoint de contact / devis
   Utilise PHPMailer + SMTP Infomaniak pour l'envoi.
   Identifiants SMTP et journal des demandes : dans le dossier privé.
   ============================================================ */

/* Dossier privé, HORS de la racine web et hors git : smtp-config.php
   (identifiants SMTP) et contact-log.csv (journal des demandes).
   www-data seul (700) : php-fpm lit et écrit, le runner GitHub n'y entre
   pas. Même modèle que Patounes (/var/www/patounes-private). */
$PRIVE = "/var/www/afterglow-private";

require_once __DIR__ . '/vendor/autoload.php';
require_once $PRIVE . '/smtp-config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$TO        = "contact@afterglowbykevin.ch";
$FROM      = SMTP_USER;
$SUBJECT_P = "[Afterglow] Demande de devis — ";
$SITE_NAME = "Afterglow by Kevin";
/* Journal des demandes : écrit HORS de la racine web pour ne jamais être
   téléchargeable (contient nom/email/téléphone = données personnelles).
   Sauvegardé chaque nuit par /opt/snapshot-backup/backup.sh. */
$LOG_FILE  = $PRIVE . "/contact-log.csv";

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "error" => "method"]);
  exit;
}

/* --- Limitation de débit : max 3 envois / IP / 10 min ---------------------
   Empêche l'abus du relais SMTP (mailbombing, blacklist du domaine).
   Stockage léger dans le dossier temp système (pas de base de données). */
$ip       = $_SERVER["REMOTE_ADDR"] ?? "0.0.0.0";
$rlDir    = sys_get_temp_dir() . "/kc-ratelimit";
@mkdir($rlDir, 0700, true);
$rlFile   = $rlDir . "/" . hash("sha256", $ip);
$now      = time();
$window   = 600;   // 10 minutes
$maxHits  = 3;
$hits     = [];
if (is_file($rlFile)) {
  $hits = array_filter(
    array_map("intval", explode(",", (string)@file_get_contents($rlFile))),
    function ($t) use ($now, $window) { return $t > $now - $window; }
  );
}
if (count($hits) >= $maxHits) {
  http_response_code(429);
  echo json_encode(["ok" => false, "error" => "rate"]);
  exit;
}
$hits[] = $now;
@file_put_contents($rlFile, implode(",", $hits), LOCK_EX);

$raw  = file_get_contents("php://input");
$data = json_decode($raw, true);
if (!is_array($data)) { $data = $_POST; }

function field($d, $k) { return isset($d[$k]) ? trim((string)$d[$k]) : ""; }

$honeypot = field($data, "website");
$nom      = field($data, "nom");
$email    = field($data, "email");
$tel      = field($data, "tel");
$type     = field($data, "type");
$formule  = field($data, "formule");
$date     = field($data, "date");
$region   = field($data, "region");
$message  = field($data, "message");

if ($honeypot !== "") {
  echo json_encode(["ok" => true]);
  exit;
}

$errors = [];
if ($nom === "")                                   $errors["nom"]   = "Nom requis.";
if (!filter_var($email, FILTER_VALIDATE_EMAIL))    $errors["email"] = "Email invalide.";
if (!empty($errors)) {
  http_response_code(422);
  echo json_encode(["ok" => false, "errors" => $errors]);
  exit;
}

$lines = [
  "Nouvelle demande reçue depuis " . $SITE_NAME . " (afterglowbykevin.ch)",
  "----------------------------------------------------------------",
  "Prestation : " . ($type ?: "—"),
  "Formule    : " . ($formule ?: "—"),
  "Date       : " . ($date ?: "—"),
  "Lieu       : " . ($region ?: "—"),
  "",
  "Nom        : " . $nom,
  "Email      : " . $email,
  "Téléphone  : " . ($tel ?: "—"),
  "",
  "Message :",
  ($message ?: "—"),
  "",
  "----------------------------------------------------------------",
  "IP : " . ($_SERVER["REMOTE_ADDR"] ?? "—") . " · " . date("c"),
  "Envoyé via le formulaire de contact de " . $SITE_NAME,
];
$body    = implode("\n", $lines);
$subject = $SUBJECT_P . ($type ?: "Projet photo");

if ($LOG_FILE) {
  $row = [date("c"), $type, $formule, $date, $region, $nom, $email, $tel, str_replace(["\r","\n"], " ", $message)];
  $fh = @fopen($LOG_FILE, "a");
  if ($fh) { @fputcsv($fh, $row); @fclose($fh); }
}

/* Tente l'envoi avec un (chiffrement, port) donné. Renvoie [ok, erreur]. */
function kc_try_send($secure, $port, $TO, $FROM, $SITE_NAME, $email, $nom, $subject, $body) {
  $mail = new PHPMailer(true);
  try {
    $mail->isSMTP();
    $mail->Host       = SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = SMTP_USER;
    $mail->Password   = SMTP_PASS;
    $mail->SMTPSecure = $secure;
    $mail->Port       = $port;
    $mail->Timeout    = 12;          // évite qu'un SMTP injoignable bloque php-fpm
    $mail->CharSet    = 'UTF-8';
    $mail->setFrom($FROM, $SITE_NAME);
    $mail->addAddress($TO);
    $mail->addReplyTo($email, $nom);
    $mail->Subject = $subject;
    $mail->Body    = $body;
    $mail->send();
    return [true, null];
  } catch (Exception $e) {
    return [false, $mail->ErrorInfo ?: $e->getMessage()];
  }
}

/* 1) STARTTLS sur le port configuré (587 par défaut).
   2) Repli SMTPS sur 465 si le 1er échoue (587 souvent filtré sur certains VPS). */
list($ok, $errInfo) = kc_try_send(PHPMailer::ENCRYPTION_STARTTLS, SMTP_PORT, $TO, $FROM, $SITE_NAME, $email, $nom, $subject, $body);
if (!$ok) {
  list($ok2, $errInfo2) = kc_try_send(PHPMailer::ENCRYPTION_SMTPS, 465, $TO, $FROM, $SITE_NAME, $email, $nom, $subject, $body);
  if ($ok2) { $ok = true; }
  else { $errInfo = "587: " . $errInfo . " | 465: " . $errInfo2; }
}

if ($ok) {
  echo json_encode(["ok" => true]);
} else {
  http_response_code(502);
  echo json_encode(["ok" => false, "error" => "mail"]);
}
