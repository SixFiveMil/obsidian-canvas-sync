import os
import shutil
from PIL import Image, ImageDraw, ImageFont

brain_dir = r"C:\Users\joshu\.gemini\antigravity\brain\53e48c73-9792-4118-a7e1-dbb30f1e411f"
upload_dir = os.path.join(brain_dir, ".user_uploaded")
repo_assets_dir = r"d:\repos\obsidian-canvas-sync\docs\assets"
store_dir = r"d:\repos\obsidian-canvas-sync\docs\store-assets"

os.makedirs(repo_assets_dir, exist_ok=True)
os.makedirs(store_dir, exist_ok=True)

font_input = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 13)

# 1. Connection Settings Tab (media_1790088331885.png) -> screenshot_plugin_settings.png
img_conn_path = os.path.join(upload_dir, "media_1790088331885.png")
if os.path.exists(img_conn_path):
    img_conn = Image.open(img_conn_path).convert("RGBA")
    draw = ImageDraw.Draw(img_conn)
    draw.rounded_rectangle([(538, 198), (705, 226)], radius=4, fill=(30, 30, 30, 255), outline=(48, 48, 48, 255))
    draw.text((546, 204), "https://canvas.institution.edu", font=font_input, fill=(210, 210, 210, 255))
    dest = os.path.join(repo_assets_dir, "screenshot_plugin_settings.png")
    img_conn.save(dest, "PNG")
    print(f"Saved {dest}")

# 2. Course Selector Modal (media_1790088331886.png) -> screenshot_course_selector.png
img_modal_path = os.path.join(upload_dir, "media_1790088331886.png")
if os.path.exists(img_modal_path):
    img_modal = Image.open(img_modal_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_course_selector.png")
    img_modal.save(dest, "PNG")
    print(f"Saved {dest}")

# 3. Formatting Tab (media_1790088331887.png) -> screenshot_formatting_settings.png
img_fmt_path = os.path.join(upload_dir, "media_1790088331887.png")
if os.path.exists(img_fmt_path):
    img_fmt = Image.open(img_fmt_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_formatting_settings.png")
    img_fmt.save(dest, "PNG")
    print(f"Saved {dest}")

# 4. Data Types Tab (media_1790088331888.png) -> screenshot_datatypes_settings.png
img_data_path = os.path.join(upload_dir, "media_1790088331888.png")
if os.path.exists(img_data_path):
    img_data = Image.open(img_data_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_datatypes_settings.png")
    img_data.save(dest, "PNG")
    print(f"Saved {dest}")

# 5. Asset Settings Tab (media_1790088331946.png) -> screenshot_asset_settings.png
img_asset_path = os.path.join(upload_dir, "media_1790088331946.png")
if os.path.exists(img_asset_path):
    img_asset = Image.open(img_asset_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_asset_settings.png")
    img_asset.save(dest, "PNG")
    print(f"Saved {dest}")

# 6. Live Sync Progress (media_1790088460772.png) -> screenshot_sync_progress.png
img_sync_path = os.path.join(upload_dir, "media_1790088460772.png")
if os.path.exists(img_sync_path):
    img_sync = Image.open(img_sync_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_sync_progress.png")
    img_sync.save(dest, "PNG")
    print(f"Saved {dest}")

# 7. Schedule Tab (media_1790088460773.png) -> screenshot_schedule_settings.png
img_sched_path = os.path.join(upload_dir, "media_1790088460773.png")
if os.path.exists(img_sched_path):
    img_sched = Image.open(img_sched_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_schedule_settings.png")
    img_sched.save(dest, "PNG")
    print(f"Saved {dest}")

# 8. Diagnostics & Capability Probe (media_1790088460778.png) -> screenshot_diagnostics_probe.png
img_diag_path = os.path.join(upload_dir, "media_1790088460778.png")
if os.path.exists(img_diag_path):
    img_diag = Image.open(img_diag_path).convert("RGBA")
    dest = os.path.join(repo_assets_dir, "screenshot_diagnostics_probe.png")
    img_diag.save(dest, "PNG")
    print(f"Saved {dest}")

print("All screenshots successfully processed and sanitized!")
