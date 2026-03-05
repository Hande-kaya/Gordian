"""
Email Utils - Send emails via Zepto Mail API.

Reference: Portal auth_routes.py
"""

import requests
from markupsafe import escape
from config import config


def send_email_via_zepto(to_email: str, subject: str, html_content: str):
    """
    Send email via Zepto Mail API.

    Returns:
        tuple: (status_code, response_data)
    """
    try:
        if not config.ZEPTO_API_KEY:
            return 500, "Zepto API key not configured"

        response = requests.post(
            "https://api.zeptomail.com/v1.1/email",
            headers={
                "Authorization": f"Zoho-enczapikey {config.ZEPTO_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "from": {
                    "address": config.ZEPTO_FROM_EMAIL,
                    "name": config.ZEPTO_FROM_NAME
                },
                "to": [{"email_address": {"address": to_email}}],
                "subject": subject,
                "htmlbody": html_content
            },
            timeout=10
        )

        if response.status_code in [200, 201]:
            return 201, response.json()
        else:
            return response.status_code, response.text

    except Exception as e:
        return 500, f"Email send exception: {str(e)}"


def build_verification_email(name: str, code: str) -> str:
    """Build HTML for email verification."""
    safe_name = escape(name)
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Email Dogrulama</h2>
        <p>Merhaba {safe_name},</p>
        <p>Hesabinizi dogrulamak icin asagidaki kodu kullanin:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;
                    text-align: center; margin: 20px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #2563eb;
                        letter-spacing: 8px; margin: 15px 0;">
                {code}
            </div>
            <p style="color: #666; margin: 0;">Bu kod 10 dakika gecerlidir</p>
        </div>
        <p>Iyi gunler,<br>Gordian Analytics</p>
    </div>
    """


def build_reset_password_email(name: str, code: str) -> str:
    """Build HTML for password reset."""
    safe_name = escape(name)
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Sifre Sifirlama</h2>
        <p>Merhaba {safe_name},</p>
        <p>Sifrenizi sifirlamak icin asagidaki kodu kullanin:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;
                    text-align: center; margin: 20px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #2563eb;
                        letter-spacing: 8px; margin: 15px 0;">
                {code}
            </div>
            <p style="color: #666; margin: 0;">Bu kod 10 dakika gecerlidir</p>
        </div>
        <p>Eger siz talep etmediyseniz bu emaili gormezden gelin.</p>
        <p>Iyi gunler,<br>Gordian Analytics</p>
    </div>
    """
