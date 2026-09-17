import os
from PIL import Image, ImageDraw, ImageFont

# 1. Sanitize Image 1 (Popup)
img1_path = r'C:/Users/joshu/.gemini/antigravity/brain/9f821b01-1d1f-4158-a081-b1e8ec2e602d/.user_uploaded/media_1789680610538.png'
img1 = Image.open(img1_path).convert('RGBA')
img1 = img1.crop((0, 0, img1.width, 532))
draw1 = ImageDraw.Draw(img1)
draw1.rounded_rectangle([(25, 93), (313, 157)], radius=8, fill=(237, 242, 237, 255))
font_code = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 13)
font_title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 13)
font_section = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 12)
draw1.text((36, 100), '[CS-101]', font=font_code, fill=(0, 105, 92, 255))
draw1.text((36, 118), 'Introduction to Computer Science', font=font_title, fill=(33, 37, 41, 255))
draw1.text((36, 136), '(CS-101-01)', font=font_section, fill=(51, 51, 51, 255))

out1_repo = r'd:/repos/obsidian-canvas-sync/docs/assets/screenshot_extension_popup.png'
out1_artifact = r'C:/Users/joshu/.gemini/antigravity/brain/9f821b01-1d1f-4158-a081-b1e8ec2e602d/screenshot_extension_popup.png'
img1.save(out1_repo, 'PNG')
img1.save(out1_artifact, 'PNG')

# 2. Sanitize Image 2 (Asset Downloads)
img2_path = r'C:/Users/joshu/.gemini/antigravity/brain/9f821b01-1d1f-4158-a081-b1e8ec2e602d/.user_uploaded/media_1789680610539.png'
img2 = Image.open(img2_path).convert('RGBA')
draw2 = ImageDraw.Draw(img2)
font_input12 = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 12)

# Clear custom extensions box
draw2.rectangle([(533, 472), (693, 497)], fill=(46, 46, 46, 255))
draw2.text((540, 477), 'pdf, docx, pptx, xlsx, png, zip', font=font_input12, fill=(224, 224, 224, 255))

out2_repo = r'd:/repos/obsidian-canvas-sync/docs/assets/screenshot_asset_settings.png'
out2_artifact = r'C:/Users/joshu/.gemini/antigravity/brain/9f821b01-1d1f-4158-a081-b1e8ec2e602d/screenshot_asset_settings.png'
img2.save(out2_repo, 'PNG')
img2.save(out2_artifact, 'PNG')

# 3. Sanitize Image 3 (Full Plugin Settings)
img3_path = r'C:/Users/joshu/.gemini/antigravity/brain/9f821b01-1d1f-4158-a081-b1e8ec2e602d/.user_uploaded/media_1789680610545.png'
img3 = Image.open(img3_path).convert('RGBA')
draw3 = ImageDraw.Draw(img3)
font_desc = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 10)

# Replace description under Canvas base URL
draw3.rectangle([(75, 84), (430, 108)], fill=(35, 35, 35, 255))
draw3.text((78, 86), "The web address of your Canvas institution (e.g. 'https://canvas.institution.edu' or", font=font_desc, fill=(136, 136, 136, 255))
draw3.text((78, 98), "'https://canvas.instructure.com').", font=font_desc, fill=(136, 136, 136, 255))

# Canvas base URL input box
draw3.rectangle([(452, 69), (572, 88)], fill=(46, 46, 46, 255))
draw3.text((458, 70), 'https://canvas.instructure.com', font=font_input12, fill=(224, 224, 224, 255))

# Root folder
draw3.rectangle([(452, 654), (572, 673)], fill=(46, 46, 46, 255))
draw3.text((458, 655), 'Canvas', font=font_input12, fill=(224, 224, 224, 255))

# Course folder template
draw3.rectangle([(452, 713), (572, 730)], fill=(46, 46, 46, 255))
draw3.text((458, 714), '{{courseCode}} - {{courseName}}', font=font_input12, fill=(224, 224, 224, 255))

out3_repo = r'd:/repos/obsidian-canvas-sync/docs/assets/screenshot_plugin_settings.png'
out3_artifact = r'C:/Users/joshu/.gemini/antigravity/brain/9f821b01-1d1f-4158-a081-b1e8ec2e602d/screenshot_plugin_settings.png'
img3.save(out3_repo, 'PNG')
img3.save(out3_artifact, 'PNG')

print('All 3 sterilized screenshots generated and saved successfully.')
