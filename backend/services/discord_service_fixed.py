"""Discord webhook + Cloudflare Turnstile verification."""
import httpx
import logging
from config import *


    """
    Verify Cloudflare Turnstile token
    Returns dict with 'success' and 'error' keys
    """
    # Debug: Log what we're working with
    logging.info(f"[Turnstile] Verifying token: {token[:20] if token else 'NONE'}...")
    logging.info(f"[Turnstile] Secret key configured: {'YES' if TURNSTILE_SECRET_KEY else 'NO'}")
    logging.info(f"[Turnstile] Client IP: {ip}")
    
    if not TURNSTILE_SECRET_KEY:
        logging.warning("[Turnstile] No secret key configured - SKIPPING verification (dev mode)")
        return {"success": True, "error": None}
    
    if not token:
        logging.error("[Turnstile] No token provided!")
        return {"success": False, "error": "No captcha token provided"}
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "secret": TURNSTILE_SECRET_KEY,
                "response": token,
            }
            # Only add IP if provided
            if ip:
                payload["remoteip"] = ip
            
            logging.info(f"[Turnstile] Sending verification request to Cloudflare...")
            
            response = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data=payload
            )
            
            result = response.json()
            logging.info(f"[Turnstile] Cloudflare response: {result}")
            
            if result.get("success"):
                logging.info("[Turnstile] Verification SUCCESS")
                return {"success": True, "error": None}
            else:
                error_codes = result.get("error-codes", [])
                logging.error(f"[Turnstile] Verification FAILED: {error_codes}")
                return {"success": False, "error": f"Verification failed: {error_codes}"}
                
    except httpx.TimeoutException:
        logging.error("[Turnstile] Request timeout!")
        return {"success": False, "error": "Verification timeout"}
    except Exception as e:


async def send_discord_webhook(event_type: str, data: dict):
    """Send Discord webhook for big wins and level-ups"""
    if not DISCORD_WEBHOOK_URL:
        return
    
    try:
        embed = {
            "title": f"🎰 {event_type}",
            "color": 16766720 if "Win" in event_type else 5814783,
            "fields": [
                {"name": k, "value": str(v), "inline": True}
                for k, v in data.items()
            ],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                DISCORD_WEBHOOK_URL,
                json={"embeds": [embed]}
            )
    except Exception as e:
        logging.error(f"Discord webhook error: {e}")

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=TokenResponse)
@limiter.limit("1/minute")
@limiter.limit("3/hour")
@limiter.limit("5/day")
