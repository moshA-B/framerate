# services/mailer.py - sends an email with Python's built-in smtplib.
# If no SMTP server is configured (SMTP_HOST empty), nothing is sent: the message is
# printed in the backend log instead, so the password-reset flow can still be tested.
import smtplib
from email.message import EmailMessage

import config


def send_email(to: str, subject: str, body: str) -> None:
    if not config.SMTP_HOST:
        print(f"\n--- EMAIL (SMTP not configured, printed instead) ---\nTo: {to}\n"
              f"Subject: {subject}\n\n{body}\n--- end of email ---\n", flush=True)
        return

    message = EmailMessage()
    message["From"] = config.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as server:
            server.starttls()  # encrypt the connection before sending the password
            if config.SMTP_USER:
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.send_message(message)
    except Exception as error:
        # This runs after the response was already sent, so we can only log the problem.
        print(f"Could not send email to {to}: {error}", flush=True)
