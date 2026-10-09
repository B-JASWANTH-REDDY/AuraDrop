# AuraDrop Store Listing & Release Compliance Checklist

**Target Platforms:** Google Play Store (Android) & Desktop (Windows MSI/NSIS)  
**App Version:** 2.0.1  
**Release Tag:** `v2.0.1`  
**License:** MIT  

---

## 1. Google Play Store Listing & Data Safety Form

### A. App Basics
- **App Title:** AuraDrop — Fast Local P2P AirDrop
- **Short Description:** High-speed peer-to-peer file sharing and chat over local Wi-Fi. Zero cloud.
- **Full Description:**  
  AuraDrop is a fast, privacy-respecting file transfer utility designed to seamlessly move photos, 4K videos, large archives, and documents between Android, Windows, and macOS devices on your local network.
  
  **Key Features:**
  - **Zero Cloud, Zero Upload:** Files move directly between devices using physical LAN sockets. No intermediate cloud servers, bandwidth limits, or privacy concerns.
  - **Blazing Fast Speeds:** Utilizes raw direct TCP streaming, reaching 50 to 100+ MB/s over modern Wi-Fi 6 / 5GHz networks.
  - **Instant Discovery:** Automatic device discovery on local Wi-Fi using UDP multicast.
  - **Dynamic AirDrop Island:** Floating non-intrusive proximity notification for quick sharing over other apps and on home screen.
  - **Real-Time Peer Chat:** Direct end-to-end device messaging without internet access.
  - **Cryptographic Verification:** Automatic SHA-256 integrity verification for every transfer.
  - **100% Free & Open Source:** No ads, no tracking, no subscriptions.

### B. Google Play Data Safety Section Declarations
| Question | Answer | Justification |
| :--- | :--- | :--- |
| **Does your app collect or share any user data?** | **No** | AuraDrop does not collect or transmit any user data to any external server or cloud. |
| **Is data shared with third parties?** | **No** | Zero external data sharing. |
| **Is all user data encrypted in transit?** | **Yes** | Direct LAN transfers are point-to-point and verified with cryptographic SHA-256 hashes. |
| **Can users request data deletion?** | **Yes** | All transfer history is stored strictly in a local SQLite database on the device, which users can delete anytime via Settings -> Storage & History -> Clear Transfer History. |

### C. Android Permission Declarations & Justifications
- `NEARBY_WIFI_DEVICES`: Declared with `android:usesPermissionFlags="neverForLocation"`. Used strictly to discover AuraDrop peer instances on the local Wi-Fi network.
- `ACCESS_FINE_LOCATION`: Required by Android versions < 13 to query Wi-Fi network connection info. Prominently disclosed in-app that GPS coordinates are never accessed.
- `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`: Required so the user can select photos, videos, and music files to share.
- `FOREGROUND_SERVICE` & `FOREGROUND_SERVICE_DATA_SYNC`: Required to keep large high-speed file transfers alive when the user navigates away or turns off the screen.
- `POST_NOTIFICATIONS`: Required on Android 13+ to show persistent file transfer progress bars and completion alerts.
- `SYSTEM_ALERT_WINDOW`: (Optional) Used to render the non-intrusive floating dynamic island pill overlay when a peer is discovered.

---

## 2. Windows Desktop Release (Tauri 2 NSIS / MSI)

- **Installer Path:** `C:\Users\bjasw\Downloads\AuraDrop-Setup.exe`
- **Application ID:** `com.auradrop.desktop`
- **Architecture:** x64 Native Windows (Tauri 2 + Rust + React)
- **Local Firewall Port:** Port 53317 (UDP multicast `224.0.0.167` + TCP stream socket)
- **Code Signing Notice:** For public distribution without SmartScreen warnings, sign the executable with an EV or standard Authenticode certificate.

---

## 3. Voluntary Support ("Buy Me a Coffee") Notice
- **URL:** `https://buymeacoffee.com/auradrop`
- **Policy Compliance:** The donation link is purely voluntary and does not lock or unlock any features of the application. In compliance with Google Play Store policies on donations vs. in-app billing for digital goods, the link is presented as a developer tip jar in the About/Support screen.
