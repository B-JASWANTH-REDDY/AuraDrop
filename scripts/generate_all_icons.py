import os
from PIL import Image

SOURCE_PATH = r"C:\Users\bjasw\\.gemini\antigravity\brain\df2ec1ff-499e-4b46-a8e5-7cde2456cc08\\.user_uploaded\\media_1791533115979.png"
ROOT_DIR = r"C:\Users\bjasw\Downloads\airdrop"

def generate():
    if not os.path.exists(SOURCE_PATH):
        raise FileNotFoundError(f"Source logo not found at {SOURCE_PATH}")
    
    img = Image.open(SOURCE_PATH).convert("RGBA")
    print(f"Loaded source image: {img.size}")

    # Output definitions: (relative_path, size_tuple)
    targets = [
        # Android launcher icons
        ("apps/android/android/app/src/main/res/mipmap-mdpi/ic_launcher.png", (48, 48)),
        ("apps/android/android/app/src/main/res/mipmap-hdpi/ic_launcher.png", (72, 72)),
        ("apps/android/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", (96, 96)),
        ("apps/android/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", (144, 144)),
        ("apps/android/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", (192, 192)),
        ("apps/android/android/app/src/main/res/drawable/ic_auradrop_badge.png", (128, 128)),
        ("apps/android/android/app/src/main/res/drawable/ic_auradrop_logo.png", (256, 256)),
        ("apps/android/assets/logo.png", (512, 512)),
        ("apps/android/assets/icon.png", (256, 256)),

        # Desktop Tauri icons
        ("apps/desktop/src-tauri/icons/32x32.png", (32, 32)),
        ("apps/desktop/src-tauri/icons/128x128.png", (128, 128)),
        ("apps/desktop/src-tauri/icons/128x128@2x.png", (256, 256)),
        ("apps/desktop/src-tauri/icons/icon.png", (512, 512)),
        ("apps/desktop/src-tauri/icons/Square30x30Logo.png", (30, 30)),
        ("apps/desktop/src-tauri/icons/Square44x44Logo.png", (44, 44)),
        ("apps/desktop/src-tauri/icons/Square71x71Logo.png", (71, 71)),
        ("apps/desktop/src-tauri/icons/Square89x89Logo.png", (89, 89)),
        ("apps/desktop/src-tauri/icons/Square107x107Logo.png", (107, 107)),
        ("apps/desktop/src-tauri/icons/Square142x142Logo.png", (142, 142)),
        ("apps/desktop/src-tauri/icons/Square150x150Logo.png", (150, 150)),
        ("apps/desktop/src-tauri/icons/Square284x284Logo.png", (284, 284)),
        ("apps/desktop/src-tauri/icons/Square310x310Logo.png", (310, 310)),
        ("apps/desktop/src-tauri/icons/StoreLogo.png", (50, 50)),
        ("apps/desktop/src/assets/logo.png", (512, 512)),

        # Web portal assets
        ("apps/web/public/logo.png", (512, 512)),
        ("apps/web/public/favicon.png", (64, 64)),
    ]

    for rel_path, (w, h) in targets:
        full_path = os.path.join(ROOT_DIR, rel_path.replace("/", os.sep))
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        resized = img.resize((w, h), Image.Resampling.LANCZOS)
        resized.save(full_path, "PNG")
        print(f"Generated: {rel_path} ({w}x{h})")

    # Generate Desktop icon.ico
    ico_path = os.path.join(ROOT_DIR, "apps", "desktop", "src-tauri", "icons", "icon.ico")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"Generated Desktop icon.ico: {ico_path}")

    # Generate Web favicon.ico
    web_ico_path = os.path.join(ROOT_DIR, "apps", "web", "public", "favicon.ico")
    os.makedirs(os.path.dirname(web_ico_path), exist_ok=True)
    img.save(web_ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"Generated Web favicon.ico: {web_ico_path}")

    print("Successfully generated all logo and icon assets!")

if __name__ == "__main__":
    generate()
