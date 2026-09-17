import os
from PIL import Image, ImageDraw, ImageFont

brain_dir = r"C:\Users\joshu\.gemini\antigravity\brain\9f821b01-1d1f-4158-a081-b1e8ec2e602d"
repo_assets_dir = r"d:\repos\obsidian-canvas-sync\docs\assets"

font_code = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 13)
font_title = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 13)
font_section = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 12)
font_input12 = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 12)
font_desc = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 10)
font_sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 11)
font_badge = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 11)

# 1. Process Image 1: Browser Extension Popup (media_1789680610538.png)
img1_path = os.path.join(brain_dir, ".user_uploaded", "media_1789680610538.png")
if os.path.exists(img1_path):
    img1 = Image.open(img1_path).convert("RGBA")
    img1 = img1.crop((0, 0, img1.width, 532))
    draw1 = ImageDraw.Draw(img1)
    draw1.rounded_rectangle([(25, 93), (313, 157)], radius=8, fill=(237, 242, 237, 255))
    draw1.text((36, 100), "[CS-101]", font=font_code, fill=(0, 105, 92, 255))
    draw1.text((36, 118), "Introduction to Computer Science", font=font_title, fill=(33, 37, 41, 255))
    draw1.text((36, 136), "(CS-101-01)", font=font_section, fill=(51, 51, 51, 255))

    img1.save(os.path.join(repo_assets_dir, "screenshot_extension_popup.png"), "PNG")
    img1.save(os.path.join(brain_dir, "screenshot_extension_popup.png"), "PNG")
    print("Processed popup image.")

# 2. Process Image 2: Asset Settings (media_1789680610539.png)
img2_path = os.path.join(brain_dir, ".user_uploaded", "media_1789680610539.png")
if os.path.exists(img2_path):
    img2 = Image.open(img2_path).convert("RGBA")
    draw2 = ImageDraw.Draw(img2)
    draw2.rectangle([(533, 472), (693, 497)], fill=(46, 46, 46, 255))
    draw2.text((540, 477), "pdf, docx, pptx, xlsx, png, zip", font=font_input12, fill=(224, 224, 224, 255))

    img2.save(os.path.join(repo_assets_dir, "screenshot_asset_settings.png"), "PNG")
    img2.save(os.path.join(brain_dir, "screenshot_asset_settings.png"), "PNG")
    print("Processed asset settings image.")

# 3. Process Image 3: Plugin Settings (media_1789680610545.png)
img3_path = os.path.join(brain_dir, ".user_uploaded", "media_1789680610545.png")
if os.path.exists(img3_path):
    img3 = Image.open(img3_path).convert("RGBA")
    draw3 = ImageDraw.Draw(img3)
    
    # Description under Canvas Base URL
    draw3.rectangle([(75, 84), (430, 108)], fill=(35, 35, 35, 255))
    draw3.text((78, 86), "The web address of your Canvas institution (e.g. 'https://canvas.institution.edu' or", font=font_desc, fill=(136, 136, 136, 255))
    draw3.text((78, 98), "'https://canvas.instructure.com').", font=font_desc, fill=(136, 136, 136, 255))

    # Canvas base URL input
    draw3.rectangle([(452, 69), (572, 88)], fill=(46, 46, 46, 255))
    draw3.text((458, 70), "https://canvas.instructure.com", font=font_input12, fill=(224, 224, 224, 255))

    # Root folder input
    draw3.rectangle([(452, 654), (572, 673)], fill=(46, 46, 46, 255))
    draw3.text((458, 655), "Canvas", font=font_input12, fill=(224, 224, 224, 255))

    # Course folder template input
    draw3.rectangle([(452, 713), (572, 730)], fill=(46, 46, 46, 255))
    draw3.text((458, 714), "{{courseCode}} - {{courseName}}", font=font_input12, fill=(224, 224, 224, 255))

    img3.save(os.path.join(repo_assets_dir, "screenshot_plugin_settings.png"), "PNG")
    img3.save(os.path.join(brain_dir, "screenshot_plugin_settings.png"), "PNG")
    print("Processed plugin settings image.")

# 4. Process Image 4: Course Selector Modal (media_1789681145200.png)
img4_path = os.path.join(brain_dir, ".user_uploaded", "media_1789681145200.png")
if os.path.exists(img4_path):
    img4 = Image.open(img4_path).convert("RGBA")
    draw4 = ImageDraw.Draw(img4)

    items = [
        (128, 186, "Introduction to Computer Science (CS-101-01)", "CS-101 \u2022 Fall 2026 A"),
        (188, 258, "Data Structures & Algorithms (CS-201-01)", "CS-201 \u2022 Fall 2026 B"),
        (260, 329, "Software Architecture & Design (CS-350-02)", "CS-350 \u2022 Spring 2026 A"),
        (331, 381, "Computer Systems & Networking (CS-320-01)", "CS-320 \u2022 Spring 2026 B"),
        (383, 433, "Database Management Systems (CS-430-01)", "CS-430 \u2022 Fall 2025 B"),
        (435, 485, "Operating Systems & Concurrency (CS-450-01)", "CS-450 \u2022 Spring 2025 B")
    ]

    for y_top, y_bot, title, sub in items:
        # Clear entire item content area from checkbox right edge (x=48) to right margin (x=515)
        draw4.rectangle([(48, y_top + 1), (515, y_bot - 1)], fill=(28, 28, 28, 255))
        
        h = y_bot - y_top
        if h > 60:
            draw4.text((54, y_top + 18), title, font=font_title, fill=(225, 225, 225, 255))
            draw4.text((54, y_top + 39), sub, font=font_sub, fill=(160, 160, 160, 255))
            badge_y = y_top + 19
        else:
            draw4.text((54, y_top + 10), title, font=font_title, fill=(225, 225, 225, 255))
            draw4.text((54, y_top + 28), sub, font=font_sub, fill=(160, 160, 160, 255))
            badge_y = y_top + 16
        
        # Draw uniform Inactive / Past badge
        draw4.rounded_rectangle([(424, badge_y), (506, badge_y + 20)], radius=4, fill=(45, 45, 45, 255))
        draw4.text((431, badge_y + 2), "Inactive / Past", font=font_badge, fill=(165, 165, 165, 255))

    for y_border in [127, 187, 259, 330, 382, 434, 486]:
        draw4.line([(15, y_border), (512, y_border)], fill=(51, 51, 51, 255), width=1)

    img4.save(os.path.join(repo_assets_dir, "screenshot_course_selector.png"), "PNG")
    img4.save(os.path.join(brain_dir, "screenshot_course_selector.png"), "PNG")
    print("Processed course selector modal image.")

print("All screenshots successfully processed from user's actual captures!")
