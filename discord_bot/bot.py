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

print("ADMIN_API_KEY:", ADMIN_API_KEY)

bot = commands.Bot(command_prefix="!", intents=intents)

def is_admin(user_id: int) -> bool:
    """Check if user is an admin"""
    return user_id in ADMIN_USER_IDS

async def api_request(method: str, endpoint: str, data: dict = None) -> dict:
    """Make authenticated request to backend API"""
    url = f"{API_BASE_URL}/api{endpoint}"
    headers = {"X-Admin-Key": ADMIN_API_KEY, "Content-Type": "application/json"}

    async with aiohttp.ClientSession() as session:
        if method == "GET":
            async with session.get(url, headers=headers) as resp:
                result = {"status": resp.status, "data": await resp.json()}
        elif method == "POST":
            async with session.post(url, headers=headers, json=data) as resp:
                result = {"status": resp.status, "data": await resp.json()}
        else:
            raise ValueError("Unsupported HTTP method")

    # 🔥 GLOBAL ERROR HANDLING
    if result["status"] >= 400:
        raise app_commands.AppCommandError(
            result["data"].get("detail", f"API Error {result['status']}")
        )

    return result

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
    
    try:
        result = await api_request("POST", "/admin/mute", {
            "username": username,
            "duration_seconds": seconds
        })
    except app_commands.AppCommandError as e:
        await interaction.followup.send(f"❌ {e}")
        return
    
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

@bot.event
async def on_app_command_completion(interaction: discord.Interaction, command: app_commands.Command):

    guild = interaction.guild
    user = interaction.user
    channel = interaction.channel

    log_channel = discord.utils.get(guild.text_channels, name="bot-logs")

    if not log_channel:
        return

    embed = discord.Embed(
        title="📌 Command Used",
        color=0x2b2d31
    )

    embed.add_field(name="User", value=f"{user} ({user.id})", inline=False)
    embed.add_field(name="Command", value=f"/{command.name}", inline=True)
    embed.add_field(name="Channel", value=f"#{channel.name}", inline=True)
    embed.add_field(name="Server", value=f"{guild.name}", inline=False)
    embed.add_field(name="Time (UTC)", value=str(discord.utils.utcnow()), inline=False)

    # Parameters
    if interaction.data and "options" in interaction.data:
        params = "\n".join(
            f"{opt['name']}: {opt.get('value')}"
            for opt in interaction.data["options"]
        )
        embed.add_field(name="Parameters", value=params, inline=False)

    await log_channel.send(embed=embed)

@bot.event
async def on_app_command_error(interaction: discord.Interaction, error):

    try:
        if interaction.response.is_done():
            await interaction.followup.send(
                f"❌ Error: {error}",
                ephemeral=True
            )
        else:
            await interaction.response.send_message(
                f"❌ Error: {error}",
                ephemeral=True
            )
    except:
        pass  # verhindert doppeltes senden

    # Logging
    guild = interaction.guild
    log_channel = discord.utils.get(guild.text_channels, name="bot-logs")

    if log_channel:
        embed = discord.Embed(
            title=f"🚨 /{interaction.command.name}",
            color=0xff0000
        )
        embed.add_field(name="Error", value=str(error), inline=False)
        embed.add_field(name="User", value=f"{interaction.user} ({interaction.user.id})", inline=False)
        embed.add_field(name="Channel", value=f"#{interaction.channel.name}", inline=True)
        embed.add_field(name="Server", value=guild.name, inline=True)

        await log_channel.send(embed=embed)


# ============== SHOP MANAGEMENT COMMANDS ==============

@bot.tree.command(name="shop-add", description="Add a new item to the shop")
@app_commands.describe(
    name="Item name",
    rarity="Item rarity (common/uncommon/rare/epic/legendary)",
    description="Item description/flavor text",
    price="Price in G",
    value="Base sell value in G",
    available_hours="Hours until item disappears from shop",
    untradeable_hours="Hours the item is untradeable after purchase",
    image_url="URL to item image (optional)",
    stock="Stock limit (0 = unlimited)"
)
@app_commands.choices(rarity=[
    app_commands.Choice(name="Common", value="common"),
    app_commands.Choice(name="Uncommon", value="uncommon"),
    app_commands.Choice(name="Rare", value="rare"),
    app_commands.Choice(name="Epic", value="epic"),
    app_commands.Choice(name="Legendary", value="legendary")
])
async def shop_add(
    interaction: discord.Interaction,
    name: str,
    rarity: str,
    description: str,
    price: float,
    value: float,
    available_hours: int,
    untradeable_hours: int,
    image_url: str = None,
    stock: int = 0
):
    """Add a new item to the shop (Admin only)"""
    if not is_admin(interaction.user.id):
        await interaction.response.send_message("❌ You don't have permission to use this command.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_BASE_URL}/api/admin/shop/add",
                json={
                    "item_name": name,
                    "item_rarity": rarity,
                    "item_description": description,
                    "item_image": image_url,
                    "price": price,
                    "base_value": value,
                    "available_hours": available_hours,
                    "untradeable_hours": untradeable_hours,
                    "stock_limit": stock if stock > 0 else None
                },
                headers={"X-Admin-Key": ADMIN_API_KEY}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    
                    embed = discord.Embed(
                        title="✅ Shop Item Added",
                        color=get_rarity_color(rarity)
                    )
                    embed.add_field(name="Name", value=data["item_name"], inline=True)
                    embed.add_field(name="Rarity", value=data["item_rarity"].capitalize(), inline=True)
                    embed.add_field(name="Price", value=f"{data['price']} G", inline=True)
                    embed.add_field(name="Shop Duration", value=f"{data['hours_available']}h", inline=True)
                    embed.add_field(name="Untradeable", value=f"{data['hours_untradeable']}h", inline=True)
                    embed.add_field(name="Stock", value=str(stock) if stock > 0 else "Unlimited", inline=True)
                    embed.add_field(name="Listing ID", value=f"`{data['shop_listing_id']}`", inline=False)
                    
                    if image_url:
                        embed.set_thumbnail(url=image_url)
                    
                    await interaction.followup.send(embed=embed, ephemeral=True)
                else:
                    error_data = await resp.json()
                    await interaction.followup.send(f"❌ Failed: {error_data.get('detail', 'Unknown error')}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}", ephemeral=True)


@bot.tree.command(name="shop-list", description="List all shop items")
async def shop_list(interaction: discord.Interaction):
    """List all shop items (Admin only)"""
    if not is_admin(interaction.user.id):
        await interaction.response.send_message("❌ You don't have permission to use this command.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{API_BASE_URL}/api/admin/shop/list",
                headers={"X-Admin-Key": ADMIN_API_KEY}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    items = data.get("items", [])
                    
                    if not items:
                        await interaction.followup.send("📦 No items in shop.", ephemeral=True)
                        return
                    
                    embed = discord.Embed(
                        title="🏪 Shop Items",
                        description=f"Total: {len(items)} items",
                        color=0x00ff00
                    )
                    
                    for item in items[:25]:  # Discord limit
                        status = "🔴 Expired" if item.get("is_expired") else ("🟢 Active" if item.get("is_active") else "⚫ Inactive")
                        hours_left = item.get("hours_remaining")
                        time_str = f"{hours_left}h left" if hours_left is not None else "∞"
                        
                        embed.add_field(
                            name=f"{status} {item['item_name']}",
                            value=f"Rarity: {item['item_rarity']}\nPrice: {item['price']} G\nTime: {time_str}\nID: `{item['shop_listing_id'][:12]}...`",
                            inline=True
                        )
                    
                    await interaction.followup.send(embed=embed, ephemeral=True)
                else:
                    error_data = await resp.json()
                    await interaction.followup.send(f"❌ Failed: {error_data.get('detail', 'Unknown error')}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}", ephemeral=True)


@bot.tree.command(name="shop-edit", description="Edit a shop item")
@app_commands.describe(
    listing_id="Shop listing ID (from /shop-list)",
    name="New item name (optional)",
    description="New description (optional)",
    price="New price in G (optional)",
    value="New base sell value (optional)",
    extend_hours="Extend availability by X hours (optional)",
    untradeable_hours="Set new untradeable duration (optional)",
    image_url="New image URL (optional)",
    stock="New stock limit, 0=unlimited (optional)",
    active="Set active status (optional)"
)
async def shop_edit(
    interaction: discord.Interaction,
    listing_id: str,
    name: str = None,
    description: str = None,
    price: float = None,
    value: float = None,
    extend_hours: int = None,
    untradeable_hours: int = None,
    image_url: str = None,
    stock: int = None,
    active: bool = None
):
    """Edit an existing shop item (Admin only)"""
    if not is_admin(interaction.user.id):
        await interaction.response.send_message("❌ You don't have permission to use this command.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    # Build request with only provided fields
    request_data = {"shop_listing_id": listing_id}
    if name is not None:
        request_data["item_name"] = name
    if description is not None:
        request_data["item_description"] = description
    if price is not None:
        request_data["price"] = price
    if value is not None:
        request_data["base_value"] = value
    if extend_hours is not None:
        request_data["available_hours"] = extend_hours
    if untradeable_hours is not None:
        request_data["untradeable_hours"] = untradeable_hours
    if image_url is not None:
        request_data["item_image"] = image_url
    if stock is not None:
        request_data["stock_limit"] = stock
    if active is not None:
        request_data["is_active"] = active
    
    if len(request_data) == 1:
        await interaction.followup.send("❌ No changes specified.", ephemeral=True)
        return
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_BASE_URL}/api/admin/shop/edit",
                json=request_data,
                headers={"X-Admin-Key": ADMIN_API_KEY}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    
                    embed = discord.Embed(
                        title="✅ Shop Item Updated",
                        color=0x00ff00
                    )
                    embed.add_field(name="Listing ID", value=f"`{data['shop_listing_id']}`", inline=False)
                    embed.add_field(name="Updated Fields", value=", ".join(data["updated_fields"]), inline=False)
                    
                    await interaction.followup.send(embed=embed, ephemeral=True)
                else:
                    error_data = await resp.json()
                    await interaction.followup.send(f"❌ Failed: {error_data.get('detail', 'Unknown error')}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}", ephemeral=True)


@bot.tree.command(name="shop-remove", description="Remove an item from the shop")
@app_commands.describe(
    listing_id="Shop listing ID (from /shop-list)"
)
async def shop_remove(interaction: discord.Interaction, listing_id: str):
    """Remove an item from the shop (Admin only)"""
    if not is_admin(interaction.user.id):
        await interaction.response.send_message("❌ You don't have permission to use this command.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{API_BASE_URL}/api/admin/shop/remove",
                json={"shop_listing_id": listing_id},
                headers={"X-Admin-Key": ADMIN_API_KEY}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    
                    embed = discord.Embed(
                        title="🗑️ Shop Item Removed",
                        color=0xff6600
                    )
                    embed.add_field(name="Item", value=data.get("item_name", "Unknown"), inline=True)
                    embed.add_field(name="Listing ID", value=f"`{data['shop_listing_id']}`", inline=True)
                    
                    await interaction.followup.send(embed=embed, ephemeral=True)
                else:
                    error_data = await resp.json()
                    await interaction.followup.send(f"❌ Failed: {error_data.get('detail', 'Unknown error')}", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}", ephemeral=True)


def get_rarity_color(rarity: str) -> int:
    """Get Discord color for item rarity"""
    colors = {
        "common": 0x808080,
        "uncommon": 0x1eff00,
        "rare": 0x0070dd,
        "epic": 0xa335ee,
        "legendary": 0xff8000
    }
    return colors.get(rarity.lower(), 0x808080)


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
