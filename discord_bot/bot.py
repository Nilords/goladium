import discord
from discord.ext import commands
import os
TOKEN = os.getenv("DISCORD_TOKEN")
ADMIN_ID = 1469444394221441251  # deine Discord User ID
GUILD_ID = 1469447166148870168   # HIER deine Server ID einsetzen

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)
economy = {}

def is_admin(ctx):
    return ctx.author.id == ADMIN_ID


@bot.event
async def on_ready():
    print(f"Bot online als {bot.user}")


@bot.slash_command(
    name="ping",
    description="Test command",
    guild_ids=[GUILD_ID]
)
async def ping(ctx):
    await ctx.respond("Pong! 🏓")


@bot.slash_command(
    name="admin_test",
    description="Admin only command",
    guild_ids=[GUILD_ID]
)
async def admin_test(ctx):
    if not is_admin(ctx):
        await ctx.respond("❌ Keine Berechtigung.", ephemeral=True)
        return

    await ctx.respond("✅ Admin Command funktioniert.")

@bot.slash_command(
    name="balance",
    description="Zeigt das Guthaben eines Users",
    guild_ids=[GUILD_ID]
)
async def balance(ctx, member: discord.Member = None):

    target = member if member else ctx.author

    if target.id not in economy:
        economy[target.id] = {"g": 0, "a": 0}

    g = economy[target.id]["g"]
    a = economy[target.id]["a"]

    await ctx.respond(
        f"💰 Balance von {target.display_name}\n"
        f"G: {g}\n"
        f"A: {a}"
    )

@bot.slash_command(
    name="give_g",
    description="G Währung vergeben",
    guild_ids=[GUILD_ID]
)
async def give_g(ctx, member: discord.Member, amount: int):

    if not is_admin(ctx):
        await ctx.respond("❌ Keine Berechtigung.", ephemeral=True)
        return

    if member.id not in economy:
        economy[member.id] = {"g": 0, "a": 0}

    economy[member.id]["g"] += amount

    await ctx.respond(f"✅ {amount} G an {member.mention} vergeben.")

@bot.slash_command(
    name="give_a",
    description="A Währung vergeben",
    guild_ids=[GUILD_ID]
)
async def give_a(ctx, member: discord.Member, amount: int):

    if not is_admin(ctx):
        await ctx.respond("❌ Keine Berechtigung.", ephemeral=True)
        return

    if member.id not in economy:
        economy[member.id] = {"g": 0, "a": 0}

    economy[member.id]["a"] += amount

    await ctx.respond(f"💎 {amount} A an {member.mention} vergeben.")

@bot.command(name="balance")
async def balance_text(ctx, *, name: str = None):
    # wenn kein Name: eigene Balance
    if not name:
        target_id = ctx.author.id
        target_name = ctx.author.display_name
    else:
        # Versuche User im Server über Name/Nickname zu finden
        member = discord.utils.find(
            lambda m: m.name.lower() == name.lower() or m.display_name.lower() == name.lower(),
            ctx.guild.members
        )
        if not member:
            await ctx.reply(f"❌ User '{name}' nicht gefunden.")
            return
        target_id = member.id
        target_name = member.display_name

    if target_id not in economy:
        economy[target_id] = {"g": 0, "a": 0}

    g = economy[target_id]["g"]
    a = economy[target_id]["a"]

    await ctx.reply(f"💰 Balance von {target_name}\nG: {g}\nA: {a}")

bot.run(TOKEN)
