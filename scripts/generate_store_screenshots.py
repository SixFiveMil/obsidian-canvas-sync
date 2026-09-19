import os
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

brain_dir = r"C:\Users\joshu\.gemini\antigravity\brain\9f821b01-1d1f-4158-a081-b1e8ec2e602d"
store_dir = r"d:\repos\obsidian-canvas-sync\docs\store-assets"
assets_dir = r"d:\repos\obsidian-canvas-sync\docs\assets"
repo_root = Path(__file__).resolve().parent.parent
store_dir = repo_root / "docs" / "store-assets"
assets_dir = repo_root / "docs" / "assets"
brain_dir = Path(os.environ.get("BRAIN_DIR", store_dir))

os.makedirs(store_dir, exist_ok=True)

font_hero = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 26)
font_sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 15)
font_badge = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 12)
font_card = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 13)
font_card_b = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 13)
font_tree = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 12)
font_tree_b = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 12)

def create_base_canvas(title: str, subtitle: str, badge_text: str = "CANVAS TO OBSIDIAN"):
    img = Image.new("RGB", (1280, 800), color=(18, 18, 24))
    draw = ImageDraw.Draw(img)

    # Background gradient
    for y in range(800):
        r = int(15 + (y / 800) * 8)
        g = int(16 + (y / 800) * 10)
        b = int(24 + (y / 800) * 14)
        draw.line([(0, y), (1280, y)], fill=(r, g, b))

    # Header Badge
    badge_w = 170
    draw.rounded_rectangle([(40, 32), (40 + badge_w, 56)], radius=12, fill=(40, 30, 70))
    draw.text((54, 37), badge_text, font=font_badge, fill=(167, 139, 250))

    # Title & Subtitle
    draw.text((40, 68), title, font=font_hero, fill=(245, 245, 250))
    draw.text((40, 106), subtitle, font=font_sub, fill=(156, 163, 175))

    # Divider
    draw.line([(40, 138), (1240, 138)], fill=(45, 45, 58), width=1)

    return img

def add_window_frame(content_img: Image.Image, title: str = "Canvas to Obsidian Sync", width: int = 1200, height: int = 620):
    window = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(window)

    draw.rounded_rectangle([(0, 0), (width - 1, height - 1)], radius=10, fill=(30, 30, 38, 255), outline=(60, 60, 75, 255), width=1)

    # Title bar
    draw.rounded_rectangle([(0, 0), (width - 1, 38)], radius=10, fill=(24, 24, 30, 255))
    draw.rectangle([(0, 20), (width - 1, 38)], fill=(24, 24, 30, 255))
    draw.line([(0, 38), (width - 1, 38)], fill=(50, 50, 65, 255), width=1)

    # Buttons
    draw.ellipse([(14, 13), (26, 25)], fill=(239, 68, 68, 255))
    draw.ellipse([(34, 13), (46, 25)], fill=(245, 158, 11, 255))
    draw.ellipse([(54, 13), (66, 25)], fill=(16, 185, 129, 255))

    font_win = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 12)
    draw.text((width // 2 - 80, 11), title, font=font_win, fill=(156, 163, 175, 255))

    window.paste(content_img, (1, 39), content_img if content_img.mode == 'RGBA' else None)
    return window

def paste_with_shadow(base_img: Image.Image, overlay: Image.Image, pos: tuple):
    x, y = pos
    w, h = overlay.size
    
    shadow = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle([(15, 15), (w + 25, h + 25)], radius=12, fill=(0, 0, 0, 140))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))

    base_rgba = base_img.convert("RGBA")
    base_rgba.paste(shadow, (x - 20, y - 10), shadow)
    base_rgba.paste(overlay, pos, overlay if overlay.mode == "RGBA" else None)
    return base_rgba.convert("RGB")

# ==========================================
# 1. SCREENSHOT 1: Browser Extension Sync Flow
# ==========================================
print("Generating Screenshot 1: Sync Flow & Extension Popup...")
s1 = create_base_canvas(
    title="One-Click Course Extraction via Active Browser Session",
    subtitle="Zero API tokens required -- Seamlessly bridges course data to local Obsidian vault"
)

browser_w, browser_h = 760, 600
browser_view = Image.new("RGBA", (browser_w, browser_h), (26, 26, 34, 255))
b_draw = ImageDraw.Draw(browser_view)

# URL bar
b_draw.rounded_rectangle([(90, 8), (browser_w - 20, 32)], radius=5, fill=(38, 38, 48, 255))
b_draw.text((105, 11), "https://canvas.institution.edu/courses/101/modules", font=font_card, fill=(200, 200, 215, 255))

# Sidebar
b_draw.rectangle([(0, 40), (160, browser_h)], fill=(22, 22, 28, 255))
b_draw.line([(160, 40), (160, browser_h)], fill=(45, 45, 55, 255), width=1)

nav_items = ["Home", "Modules", "Assignments", "Discussions", "Grades", "Pages", "Files", "Syllabus"]
for i, item in enumerate(nav_items):
    y_nav = 60 + i * 36
    if item == "Modules":
        b_draw.rounded_rectangle([(10, y_nav - 4), (150, y_nav + 24)], radius=4, fill=(50, 40, 80, 255))
        b_draw.text((25, y_nav), item, font=font_card_b, fill=(167, 139, 250, 255))
    else:
        b_draw.text((25, y_nav), item, font=font_card, fill=(160, 160, 175, 255))

# Module content cards
b_draw.text((185, 60), "CS-101: Introduction to Computer Science", font=font_hero, fill=(240, 240, 250, 255))
b_draw.text((185, 96), "Fall 2026 - Course Modules & Lecture Hub", font=font_sub, fill=(140, 140, 155, 255))

# Module 1 Box
b_draw.rounded_rectangle([(185, 130), (browser_w - 20, 320)], radius=8, fill=(32, 32, 42, 255), outline=(50, 50, 65, 255))
b_draw.rectangle([(185, 130), (browser_w - 20, 165)], fill=(40, 40, 52, 255))
b_draw.text((200, 138), "Week 1 - Foundations & Architecture", font=font_card_b, fill=(230, 230, 245, 255))

b_draw.text((205, 180), "- [Page] 01 - Lecture Overview & Syllabus", font=font_card, fill=(210, 210, 220, 255))
b_draw.text((205, 215), "- [Lab] 02 - Development Environment Setup", font=font_card, fill=(210, 210, 220, 255))
b_draw.text((205, 250), "- [Discussion] 03 - Class Introductions", font=font_card, fill=(210, 210, 220, 255))
b_draw.text((205, 285), "- [Quiz] 04 - Syllabus & Toolchain", font=font_card, fill=(210, 210, 220, 255))

# Module 2 Box
b_draw.rounded_rectangle([(185, 340), (browser_w - 20, 530)], radius=8, fill=(32, 32, 42, 255), outline=(50, 50, 65, 255))
b_draw.rectangle([(185, 340), (browser_w - 20, 375)], fill=(40, 40, 52, 255))
b_draw.text((200, 348), "Week 2 - Data Structures & Algorithms", font=font_card_b, fill=(230, 230, 245, 255))
b_draw.text((205, 390), "- [Page] 01 - Complexity & Big-O Notation", font=font_card, fill=(210, 210, 220, 255))
b_draw.text((205, 425), "- [Assignment] 02 - Arrays & Linked Lists", font=font_card, fill=(210, 210, 220, 255))
b_draw.text((205, 460), "- [Discussion] 03 - Algorithm Efficiency", font=font_card, fill=(210, 210, 220, 255))

browser_framed = add_window_frame(browser_view, "Google Chrome - Canvas LMS", width=browser_w, height=browser_h)
s1 = paste_with_shadow(s1, browser_framed, (40, 160))

popup_img = Image.open(os.path.join(assets_dir, "screenshot_extension_popup.png")).convert("RGBA")
popup_w = 400
popup_h = int(popup_img.height * (popup_w / popup_img.width))
popup_resized = popup_img.resize((popup_w, popup_h), Image.Resampling.LANCZOS)
s1 = paste_with_shadow(s1, popup_resized, (830, 165))

s1.save(os.path.join(store_dir, "screenshot1_sync_popup_1280x800.png"), "PNG")
s1.save(os.path.join(store_dir, "screenshot1_sync_popup_1280x800.jpg"), "JPEG", quality=95)
s1.save(os.path.join(store_dir, "screenshot_1280x800.png"), "PNG")
s1.save(os.path.join(store_dir, "screenshot_1280x800.jpg"), "JPEG", quality=95)

# ==========================================
# 2. SCREENSHOT 2: Course Selector Modal (REST API)
# ==========================================
print("Generating Screenshot 2: Course Selector Modal...")
s2 = create_base_canvas(
    title="Direct REST API & Multi-Course Batch Syncing",
    subtitle="Interactive course selector with search, active/inactive filters, and one-click import"
)

modal_img = Image.open(os.path.join(assets_dir, "screenshot_course_selector.png")).convert("RGBA")
obsidian_w, obsidian_h = 1200, 600
obsidian_view = Image.new("RGBA", (obsidian_w, obsidian_h), (24, 24, 30, 255))
o_draw = ImageDraw.Draw(obsidian_view)

# Ribbon
o_draw.rectangle([(0, 0), (44, obsidian_h)], fill=(18, 18, 22, 255))
o_draw.line([(44, 0), (44, obsidian_h)], fill=(45, 45, 55, 255), width=1)
o_draw.rounded_rectangle([(6, 12), (38, 44)], radius=6, fill=(124, 58, 237, 80))
o_draw.text((14, 18), "CS", font=font_badge, fill=(255, 255, 255, 255))

# Sidebar
o_draw.rectangle([(45, 0), (280, obsidian_h)], fill=(22, 22, 26, 255))
o_draw.line([(280, 0), (280, obsidian_h)], fill=(45, 45, 55, 255), width=1)
o_draw.text((60, 20), "VAULT EXPLORER", font=font_badge, fill=(120, 120, 140, 255))
o_draw.text((60, 50), "> Canvas", font=font_tree_b, fill=(220, 220, 230, 255))
o_draw.text((80, 80), "v CS-101 - Intro to CS", font=font_tree_b, fill=(167, 139, 250, 255))
o_draw.text((100, 110), "- Course.md", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 135), "- Home.md", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 160), "- Tasks.md", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 185), "- Grades.md", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 210), "- Discussions.md", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 235), "- Calendar.md", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 260), "> Modules", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((100, 285), "> Files", font=font_tree, fill=(160, 160, 175, 255))
o_draw.text((80, 315), "> CS-350 - Software Arch", font=font_tree, fill=(180, 180, 195, 255))

# Dim workspace
o_draw.rectangle([(281, 0), (obsidian_w, obsidian_h)], fill=(10, 10, 14, 180))

modal_x = 280 + (obsidian_w - 280 - modal_img.width) // 2
modal_y = (obsidian_h - modal_img.height) // 2
obsidian_view.paste(modal_img, (modal_x, modal_y), modal_img)

obsidian_framed = add_window_frame(obsidian_view, "Obsidian - Canvas Multi-Course Sync", width=obsidian_w, height=obsidian_h)
s2 = paste_with_shadow(s2, obsidian_framed, (40, 155))

s2.save(os.path.join(store_dir, "screenshot2_course_selector_1280x800.png"), "PNG")
s2.save(os.path.join(store_dir, "screenshot2_course_selector_1280x800.jpg"), "JPEG", quality=95)

# ==========================================
# 3. SCREENSHOT 3: Rendered Notes & GFM Tables
# ==========================================
print("Generating Screenshot 3: Rendered Notes & GFM Tables...")
s3 = create_base_canvas(
    title="Clean Markdown Notes & Interactive Gradebook Standing",
    subtitle="Rich GFM tables, rubric criteria, discussion trees, and native wikilinks"
)

notes_view = Image.new("RGBA", (obsidian_w, obsidian_h), (24, 24, 30, 255))
n_draw = ImageDraw.Draw(notes_view)

# Explorer Sidebar
n_draw.rectangle([(0, 0), (240, obsidian_h)], fill=(20, 20, 24, 255))
n_draw.line([(240, 0), (240, obsidian_h)], fill=(45, 45, 55, 255), width=1)
n_draw.text((20, 20), "FILES", font=font_badge, fill=(120, 120, 140, 255))
n_draw.text((20, 50), "> Canvas", font=font_tree_b, fill=(220, 220, 230, 255))
n_draw.text((35, 80), "v CS-101 - Intro to CS", font=font_tree_b, fill=(220, 220, 230, 255))
n_draw.text((50, 110), "- Course.md", font=font_tree, fill=(160, 160, 175, 255))
n_draw.text((50, 135), "- Home.md", font=font_tree, fill=(160, 160, 175, 255))
n_draw.rounded_rectangle([(45, 156), (230, 182)], radius=4, fill=(124, 58, 237, 60))
n_draw.text((50, 160), "- Grades.md", font=font_tree_b, fill=(167, 139, 250, 255))
n_draw.text((50, 190), "- Tasks.md", font=font_tree, fill=(160, 160, 175, 255))
n_draw.text((50, 215), "- Discussions.md", font=font_tree, fill=(160, 160, 175, 255))
n_draw.text((50, 240), "- Calendar.md", font=font_tree, fill=(160, 160, 175, 255))
n_draw.text((50, 265), "> Modules", font=font_tree, fill=(160, 160, 175, 255))
n_draw.text((50, 290), "> Files", font=font_tree, fill=(160, 160, 175, 255))

# Note Content Pane
n_draw.text((275, 30), "# CS-101: Course Grades & Performance Standing", font=font_hero, fill=(245, 245, 255, 255))
n_draw.text((275, 70), "Synced live from Canvas LMS Gradebook API -- Last updated: Today", font=font_sub, fill=(140, 140, 155, 255))

# Performance Banner
n_draw.rounded_rectangle([(275, 105), (600, 185)], radius=8, fill=(16, 85, 60, 255))
n_draw.text((295, 120), "CURRENT COURSE STANDING", font=font_badge, fill=(167, 243, 208, 255))
n_draw.text((295, 145), "A (98.5%)", font=font_hero, fill=(255, 255, 255, 255))

n_draw.rounded_rectangle([(620, 105), (960, 185)], radius=8, fill=(35, 35, 48, 255), outline=(55, 55, 70, 255))
n_draw.text((640, 120), "COMPLETED ASSIGNMENTS", font=font_badge, fill=(160, 160, 175, 255))
n_draw.text((640, 145), "6 of 8 Graded", font=font_hero, fill=(240, 240, 250, 255))

# Table
n_draw.text((275, 215), "## Assignment Gradebook", font=font_card_b, fill=(230, 230, 245, 255))
table_y = 250
n_draw.rectangle([(275, table_y), (obsidian_w - 40, table_y + 32)], fill=(38, 38, 50, 255))
n_draw.text((290, table_y + 8), "Assignment Name", font=font_card_b, fill=(220, 220, 235, 255))
n_draw.text((660, table_y + 8), "Due Date", font=font_card_b, fill=(220, 220, 235, 255))
n_draw.text((800, table_y + 8), "Score", font=font_card_b, fill=(220, 220, 235, 255))
n_draw.text((930, table_y + 8), "Status", font=font_card_b, fill=(220, 220, 235, 255))
n_draw.text((1050, table_y + 8), "Feedback", font=font_card_b, fill=(220, 220, 235, 255))

rows = [
    ("[[Lab 1 - Dev Setup|Lab 1: Dev Setup]]", "Sep 15, 2026", "100 / 100", "Graded", "Excellent work!"),
    ("[[Problem Set 1|Problem Set 1: Big-O]]", "Sep 22, 2026", "98 / 100", "Graded", "Great proofs."),
    ("[[Discussion 1|Discussion: Introductions]]", "Sep 25, 2026", "10 / 10", "Graded", "Full participation."),
    ("[[Lab 2 - Linked Lists|Lab 2: Linked Lists]]", "Oct 02, 2026", "96 / 100", "Graded", "Clear edge cases."),
    ("[[Midterm Exam|Midterm Exam (Units 1-4)]]", "Oct 15, 2026", "-- / 100", "Submitted", "Pending review"),
]

for idx, (name, due, score, status, fb) in enumerate(rows):
    curr_y = table_y + 33 + idx * 36
    bg_col = (28, 28, 36, 255) if idx % 2 == 0 else (24, 24, 30, 255)
    n_draw.rectangle([(275, curr_y), (obsidian_w - 40, curr_y + 35)], fill=bg_col)
    n_draw.line([(275, curr_y + 35), (obsidian_w - 40, curr_y + 35)], fill=(45, 45, 58, 255), width=1)
    
    n_draw.text((290, curr_y + 9), name, font=font_card, fill=(167, 139, 250, 255))
    n_draw.text((660, curr_y + 9), due, font=font_card, fill=(180, 180, 195, 255))
    n_draw.text((800, curr_y + 9), score, font=font_card_b, fill=(230, 230, 240, 255))
    
    if status == "Graded":
        n_draw.rounded_rectangle([(930, curr_y + 6), (1000, curr_y + 26)], radius=4, fill=(16, 85, 60, 255))
        n_draw.text((942, curr_y + 8), status, font=font_badge, fill=(167, 243, 208, 255))
    else:
        n_draw.rounded_rectangle([(930, curr_y + 6), (1010, curr_y + 26)], radius=4, fill=(60, 50, 20, 255))
        n_draw.text((940, curr_y + 8), status, font=font_badge, fill=(253, 224, 71, 255))

    n_draw.text((1050, curr_y + 9), fb, font=font_card, fill=(160, 160, 175, 255))

notes_framed = add_window_frame(notes_view, "Obsidian - CS-101 / Grades.md", width=obsidian_w, height=obsidian_h)
s3 = paste_with_shadow(s3, notes_framed, (40, 155))

s3.save(os.path.join(store_dir, "screenshot3_obsidian_notes_1280x800.png"), "PNG")
s3.save(os.path.join(store_dir, "screenshot3_obsidian_notes_1280x800.jpg"), "JPEG", quality=95)
s3.save(os.path.join(store_dir, "screenshot2_obsidian_notes_1280x800.png"), "PNG")
s3.save(os.path.join(store_dir, "screenshot2_obsidian_notes_1280x800.jpg"), "JPEG", quality=95)

# ==========================================
# 4. SCREENSHOT 4: Granular Settings & Asset Controls
# ==========================================
print("Generating Screenshot 4: Granular Settings & Downloads...")
s4 = create_base_canvas(
    title="Comprehensive Preferences & Local Asset Downloads",
    subtitle="Configure bridge ports, allowed file types (.pdf, .docx, .zip), and download filters"
)

settings_img = Image.open(os.path.join(assets_dir, "screenshot_plugin_settings.png")).convert("RGBA")
asset_img = Image.open(os.path.join(assets_dir, "screenshot_asset_settings.png")).convert("RGBA")

half_w = 580
scale1 = half_w / settings_img.width
settings_scaled = settings_img.resize((half_w, int(settings_img.height * scale1)), Image.Resampling.LANCZOS)

scale2 = half_w / asset_img.width
asset_scaled = asset_img.resize((half_w, int(asset_img.height * scale2)), Image.Resampling.LANCZOS)

settings_scaled = settings_scaled.crop((0, 0, half_w, 580))
asset_scaled = asset_scaled.crop((0, 0, half_w, 580))

s4 = paste_with_shadow(s4, settings_scaled, (40, 160))
s4 = paste_with_shadow(s4, asset_scaled, (660, 160))

s4.save(os.path.join(store_dir, "screenshot4_settings_assets_1280x800.png"), "PNG")
s4.save(os.path.join(store_dir, "screenshot4_settings_assets_1280x800.jpg"), "JPEG", quality=95)

# ==========================================
# 5. SCREENSHOT 5: 100% Local-First & Privacy Architecture
# ==========================================
print("Generating Screenshot 5: Privacy Architecture...")
s5 = create_base_canvas(
    title="100% Local-First & Zero Telemetry Architecture",
    subtitle="Loopback connection (127.0.0.1) -- Closed by default -- Zero tracking or third-party relays"
)

arch_w, arch_h = 1200, 580
arch_view = Image.new("RGBA", (arch_w, arch_h), (22, 22, 28, 255))
a_draw = ImageDraw.Draw(arch_view)

# Card 1: Browser Session
a_draw.rounded_rectangle([(60, 60), (380, 500)], radius=12, fill=(30, 30, 40, 255), outline=(60, 60, 80, 255), width=2)
a_draw.text((85, 90), "Browser Extension", font=font_hero, fill=(245, 245, 255, 255))
a_draw.text((85, 130), "Chrome / Firefox / Brave / Edge", font=font_sub, fill=(167, 139, 250, 255))
a_draw.line([(85, 160), (355, 160)], fill=(50, 50, 65, 255), width=1)
features_ext = [
    "[+] Active Canvas LMS session",
    "[+] Zero API token requirements",
    "[+] Granular extraction checkboxes",
    "[+] Discussion reply trees",
    "[+] Real-time progress bar",
    "[+] 100% client-side execution"
]
for i, feat in enumerate(features_ext):
    a_draw.text((85, 185 + i * 45), feat, font=font_card, fill=(210, 210, 225, 255))

# Center Arrow / Bridge
a_draw.rounded_rectangle([(440, 210), (760, 350)], radius=12, fill=(40, 30, 70, 255), outline=(124, 58, 237, 255), width=2)
a_draw.text((465, 235), "Secure Local Bridge", font=font_card_b, fill=(255, 255, 255, 255))
a_draw.text((465, 265), "Loopback HTTP: 127.0.0.1:27125", font=font_card, fill=(196, 181, 253, 255))
a_draw.text((465, 295), "- Closed & disabled by default", font=font_card, fill=(167, 243, 208, 255))
a_draw.text((465, 318), "- Zero cloud transmission", font=font_card, fill=(167, 243, 208, 255))

# Card 3: Obsidian Vault
a_draw.rounded_rectangle([(820, 60), (1140, 500)], radius=12, fill=(30, 30, 40, 255), outline=(60, 60, 80, 255), width=2)
a_draw.text((845, 90), "Obsidian Vault", font=font_hero, fill=(245, 245, 255, 255))
a_draw.text((845, 130), "Desktop & Mobile Knowledge Base", font=font_sub, fill=(167, 139, 250, 255))
a_draw.line([(845, 160), (1115, 160)], fill=(50, 50, 65, 255), width=1)
features_obs = [
    "[+] Clean GFM Markdown notes",
    "[+] Automatic [[wikilinks]]",
    "[+] Gradebook & Task trackers",
    "[+] Synthesized Calendar tables",
    "[+] Offline PDF / image assets",
    "[+] Complete data ownership"
]
for i, feat in enumerate(features_obs):
    a_draw.text((845, 185 + i * 45), feat, font=font_card, fill=(210, 210, 225, 255))

s5 = paste_with_shadow(s5, arch_view, (40, 160))

s5.save(os.path.join(store_dir, "screenshot5_privacy_architecture_1280x800.png"), "PNG")
s5.save(os.path.join(store_dir, "screenshot5_privacy_architecture_1280x800.jpg"), "JPEG", quality=95)
s5.save(os.path.join(store_dir, "screenshot3_privacy_architecture.jpg"), "JPEG", quality=95)

# Copy to brain dir
for f in os.listdir(store_dir):
    if f.endswith("1280x800.png"):
        shutil.copyfile(os.path.join(store_dir, f), os.path.join(brain_dir, f))

print("All 5 Chrome Web Store screenshots regenerated with zero glyph corruption!")
