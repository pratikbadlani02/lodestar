"""Alerts service — record system events and optionally email critical ones."""
import smtplib
from email.mime.text import MIMEText
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.models import Alert

logger = get_logger(__name__)


def _send_email_sync(subject: str, body: str) -> None:
    """Blocking SMTP send — called via run_in_executor so it doesn't block the loop."""
    if not settings.smtp_host or not settings.alert_email_to:
        return
    try:
        msg = MIMEText(body)
        msg["Subject"] = f"[Lodestar] {subject}"
        msg["From"] = settings.smtp_user or "noreply@lodestar"
        msg["To"] = settings.alert_email_to
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
            if settings.smtp_user and settings.smtp_password:
                s.starttls()
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
    except Exception as e:
        logger.warning("email_send_failed", error=str(e))


async def _maybe_email(subject: str, body: str) -> None:
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email_sync, subject, body)


async def emit_alert(
    db: AsyncSession,
    severity: str,
    category: str,
    title: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> Alert:
    """
    severity: info | warning | critical
    category: risk | order | system | strategy
    """
    alert = Alert(
        severity=severity,
        category=category,
        title=title,
        message=message,
        metadata_json=metadata or {},
    )
    db.add(alert)
    await db.flush()

    log_fn = {
        "info":     logger.info,
        "warning":  logger.warning,
        "critical": logger.critical,
    }.get(severity, logger.info)
    log_fn("alert_emitted", category=category, title=title, message=message)

    if severity == "critical" and settings.smtp_host and settings.alert_email_to:
        await _maybe_email(title, f"Category: {category}\n\n{message}\n\nMetadata: {metadata or {}}")

    return alert
