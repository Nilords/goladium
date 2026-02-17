import discord
from discord.ext import commands
from discord import app_commands
import os
import aiohttp
from dotenv import load_dotenv

# Load environment variables from bot directory explicitly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


TOKEN = os.getenv("DISCORD_BOT_TOKEN")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
API_BASE_URL = os.getenv("API_BASE_URL", "https://goladium.de")
GUILD_ID = int(os.getenv("DISCORD_GUILD_ID", "0"))
ADMIN_USER_IDS = [int(x) for x in os.getenv("ADMIN_USER_IDS", "").split(",") if x.strip()]

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

def is_admin(interaction: discord.Interaction) -> bool:
    """Check if user is an admin"""
    return interaction.user.id in ADMIN_USER_IDS

async def api_request(method: str, endpoint: str, data: dict = None) -> dict:
    """Make authenticated request to backend API"""
    url = f"{API_BASE_URL}/api{endpoint}"
    headers = {"X-Admin-Key": ADMIN_API_KEY, "Content-Type": "application/json"}
    
    async with aiohttp.ClientSession() as session:
        if method == "GET":
            async with session.get(url, headers=headers) as resp:
                return {"status": resp.status, "data": await resp.json()}
        elif method == "POST":
            async with session.post(url, headers=headers, json=data) as resp:
                return {"status": resp.status, "data": await resp.json()}

def parse_duration(duration_str: str) -> int:
    """Parse duration string like '1h', '30m', '7d' to seconds. Returns -1 for permanent."""
    duration_str = duration_str.lower().strip()
    
    # Permanent mute
    if duration_str in ["permanent", "perm", "perma", "forever", "-1"]:
        return -1
    
    # Unmute (0 seconds)
    if duration_str == "0":
        return 0
    
    multipliers = {
        's': 1,
        'm': 60,
        'h': 3600,
        'd': 86400,
        'w': 604800
    }
    
    try:
        if duration_str[-1] in multipliers:
            return int(duration_str[:-1]) * multipliers[duration_str[-1]]
        else:
            return int(duration_str) * 60  # Default to minutes
    except (ValueError, IndexError):
        return 0

def format_duration(seconds: int) -> str:
    """Format seconds to human readable string"""
    if seconds <= 0:
        return "0s"
    
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    
    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if secs > 0 and not parts:
        parts.append(f"{secs}s")
    
    return " ".join(parts) if parts else "0s"

@bot.event
async def on_ready():
    print(f"Bot online as {bot.user}")
    try:
        if GUILD_ID:
            guild = discord.Object(id=GUILD_ID)
            synced = await bot.tree.sync(guild=guild)
            print(f"Synced {len(synced)} commands to guild {GUILD_ID}")
        else:
            synced = await bot.tree.sync()
            print(f"Synced {len(synced)} commands globally")
    except Exception as e:
        print(f"Failed to sync commands: {e}")

# ============== MODERATION COMMANDS ==============

@bot.tree.command(name="mute", description="Mute a user in chat (use 'perm' for permanent)")
@app_commands.describe(username="Goladium username", duration="Duration (e.g. 1h, 30m, 7d, perm)")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def mute(interaction: discord.Interaction, username: str, duration: str):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    seconds = parse_duration(duration)
    
    # Check for invalid duration (0 means unmute, not allowed here)
    if seconds == 0:
        await interaction.followup.send("Invalid duration. Use format: 1h, 30m, 7d, perm")
        return
    
    result = await api_request("POST", "/admin/mute", {
        "username": username,
        "duration_seconds": seconds
    })
    
    if result["status"] == 200:
        data = result["data"]
        if data.get("is_permanent") or seconds == -1:
            await interaction.followup.send(
                f"⛔ **{username}** has been **PERMANENTLY** muted in chat"
            )
        else:
            await interaction.followup.send(
                f"🔇 **{username}** muted for **{format_duration(seconds)}**"
            )
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

@bot.tree.command(name="unmute", description="Unmute a user (works for both temp and permanent mutes)")
@app_commands.describe(username="Goladium username")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def unmute(interaction: discord.Interaction, username: str):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("POST", "/admin/mute", {
        "username": username,
        "duration_seconds": 0
    })
    
    if result["status"] == 200:
        data = result["data"]
        was_muted = data.get("was_muted", False)
        was_perma = data.get("was_permanently_muted", False)
        
        if was_perma:
            await interaction.followup.send(f"✅ **{data['username']}** permanent mute has been removed")
        elif was_muted:
            await interaction.followup.send(f"✅ **{data['username']}** has been unmuted")
        else:
            await interaction.followup.send(f"ℹ️ **{data['username']}** was not muted")
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

@bot.tree.command(name="ban", description="Ban a user from the platform")
@app_commands.describe(username="Goladium username", duration="Duration (e.g. 1h, 30m, 7d)")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def ban(interaction: discord.Interaction, username: str, duration: str):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    seconds = parse_duration(duration)
    if seconds <= 0:
        await interaction.followup.send("Invalid duration. Use format: 1h, 30m, 7d")
        return
    
    result = await api_request("POST", "/admin/ban", {
        "username": username,
        "duration_seconds": seconds
    })
    
    if result["status"] == 200:
        await interaction.followup.send(
            f"**{username}** banned for **{format_duration(seconds)}**\nSessions invalidated."
        )
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

@bot.tree.command(name="unban", description="Unban a user")
@app_commands.describe(username="Goladium username")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def unban(interaction: discord.Interaction, username: str):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("POST", "/admin/ban", {
        "username": username,
        "duration_seconds": 0
    })
    
    if result["status"] == 200:
        await interaction.followup.send(f"**{username}** has been unbanned")
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

# ============== BALANCE COMMANDS ==============

@bot.tree.command(name="balance", description="Check a user's balance")
@app_commands.describe(username="Goladium username")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def balance(interaction: discord.Interaction, username: str):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("GET", f"/admin/userinfo/{username}")
    
    if result["status"] == 200:
        data = result["data"]
        await interaction.followup.send(
            f"**{username}** Balance:\n"
            f"G: **{data['balance_g']:.2f}**\n"
            f"A: **{data['balance_a']:.2f}**"
        )
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

@bot.tree.command(name="setbalance", description="Set a user's balance")
@app_commands.describe(username="Goladium username", currency="Currency (g or a)", amount="Amount to set")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def setbalance(interaction: discord.Interaction, username: str, currency: str, amount: float):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    if currency.lower() not in ["g", "a"]:
        await interaction.response.send_message("Currency must be 'g' or 'a'", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("POST", "/admin/balance", {
        "username": username,
        "currency": currency,
        "amount": amount,
        "action": "set"
    })
    
    if result["status"] == 200:
        data = result["data"]
        await interaction.followup.send(
            f"**{username}** {data['currency']} balance set:\n"
            f"{data['previous_balance']:.2f} → **{data['new_balance']:.2f}**"
        )
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

@bot.tree.command(name="addbalance", description="Add to a user's balance")
@app_commands.describe(username="Goladium username", currency="Currency (g or a)", amount="Amount to add")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def addbalance(interaction: discord.Interaction, username: str, currency: str, amount: float):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    if currency.lower() not in ["g", "a"]:
        await interaction.response.send_message("Currency must be 'g' or 'a'", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("POST", "/admin/balance", {
        "username": username,
        "currency": currency,
        "amount": amount,
        "action": "add"
    })
    
    if result["status"] == 200:
        data = result["data"]
        sign = "+" if amount >= 0 else ""
        await interaction.followup.send(
            f"**{username}** {data['currency']} balance:\n"
            f"{data['previous_balance']:.2f} {sign}{amount:.2f} = **{data['new_balance']:.2f}**"
        )
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

# ============== CHEST COMMANDS ==============

@bot.tree.command(name="givechest", description="Give chests to a user")
@app_commands.describe(
    username="Goladium username",
    amount="Number of chests to give",
    chest_type="Type of chest (gamepass or galadium)"
)
@app_commands.choices(chest_type=[
    app_commands.Choice(name="GamePass Chest", value="gamepass"),
    app_commands.Choice(name="Galadium Chest", value="galadium")
])
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def givechest(interaction: discord.Interaction, username: str, amount: int, chest_type: str = "gamepass"):
    if not is_admin(interaction):
        await interaction.response.send_message("❌ No permission.", ephemeral=True)
        return
    
    if amount <= 0:
        await interaction.response.send_message("❌ Amount must be positive.", ephemeral=True)
        return
    
    if amount > 100000:
        await interaction.response.send_message("❌ Maximum 100,000 chests per request.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("POST", "/admin/give-chests", {
        "username": username,
        "amount": amount,
        "chest_type": chest_type
    })
    
    if result["status"] == 200:
        data = result["data"]
        chest_emoji = "📦" if chest_type == "gamepass" else "👑"
        await interaction.followup.send(
            f"{chest_emoji} **{data['amount_given']:,}x {data['chest_type']}** given to **{data['username']}**\n"
            f"Total {data['chest_type']}s: **{data['total_chests']:,}**"
        )
    elif result["status"] == 404:
        await interaction.followup.send(f"❌ User '{username}' not found")
    else:
        await interaction.followup.send(f"❌ Error: {result['data'].get('detail', 'Unknown error')}")

# ============== INFO COMMANDS ==============

@bot.tree.command(name="userinfo", description="Get detailed user information")
@app_commands.describe(username="Goladium username")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def userinfo(interaction: discord.Interaction, username: str):
    if not is_admin(interaction):
        await interaction.response.send_message("No permission.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    result = await api_request("GET", f"/admin/userinfo/{username}")
    
    if result["status"] == 200:
        data = result["data"]
        
        # Build status indicators
        status = []
        if data["is_banned"]:
            status.append(f"BANNED ({format_duration(data['ban_remaining_seconds'])} remaining)")
        if data["is_muted"]:
            status.append(f"MUTED ({format_duration(data['mute_remaining_seconds'])} remaining)")
        status_str = " | ".join(status) if status else "Active"
        
        embed = discord.Embed(title=f"User: {data['username']}", color=0xFFD700)
        embed.add_field(name="User ID", value=data["user_id"], inline=True)
        embed.add_field(name="Level", value=f"{data['level']} ({data['xp']} XP)", inline=True)
        embed.add_field(name="Status", value=status_str, inline=False)
        embed.add_field(name="Balance G", value=f"{data['balance_g']:.2f}", inline=True)
        embed.add_field(name="Balance A", value=f"{data['balance_a']:.2f}", inline=True)
        embed.add_field(name="Total Wagered", value=f"{data['total_wagered']:.2f} G", inline=True)
        embed.add_field(name="Wins / Losses", value=f"{data['total_wins']} / {data['total_losses']}", inline=True)
        embed.add_field(name="Net Profit", value=f"{data['net_profit']:.2f} G", inline=True)
        embed.add_field(name="Created", value=data.get("created_at", "N/A")[:10], inline=True)
        
        await interaction.followup.send(embed=embed)
    elif result["status"] == 404:
        await interaction.followup.send(f"User '{username}' not found")
    else:
        await interaction.followup.send(f"Error: {result['data'].get('detail', 'Unknown error')}")

@bot.tree.command(name="ping", description="Test bot connection")
@app_commands.guilds(discord.Object(id=GUILD_ID)) if GUILD_ID else app_commands.guilds()
async def ping(interaction: discord.Interaction):
    await interaction.response.send_message(f"Pong! Latency: {round(bot.latency * 1000)}ms")

# Run bot
if __name__ == "__main__":
    if not TOKEN:
        print("ERROR: DISCORD_BOT_TOKEN not set in .env")
        exit(1)
    if not ADMIN_API_KEY:
        print("WARNING: ADMIN_API_KEY not set - API calls will fail")
    if not ADMIN_USER_IDS:
        print("WARNING: ADMIN_USER_IDS not set - no admins configured")
    
    bot.run(TOKEN)
