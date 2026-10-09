# AuraDrop Privacy Policy

**Effective Date:** October 9, 2026  
**Last Updated:** October 9, 2026  
**Version:** 2.0.1  

---

## 1. Overview & Commitment to Privacy

AuraDrop ("we", "us", or "our") is designed from the ground up as a **local-first, peer-to-peer (P2P) file transfer and direct messaging application**. Our core engineering philosophy is that your files and personal data belong exclusively to you. 

- **Zero Cloud Uploads:** Your files, images, videos, and chat messages never touch our servers, third-party cloud hosting, or intermediate relay servers.
- **Zero Telemetry & Tracking:** We do not collect, track, store, or sell any personal analytics, telemetry, device identifiers, IP logs, or behavioral data.
- **Offline Capable:** AuraDrop operates entirely over your physical Local Area Network (LAN) or Wi-Fi network, even when your internet connection is completely disconnected.

---

## 2. Information Handled by AuraDrop

### A. File Transfers & In-Transit Data
- **Mechanism:** Files transferred between devices stream directly over direct TCP sockets / HTTP streams on local port `53317`.
- **Ephemeral Processing:** Data streams through volatile system memory (RAM) in real time and is written directly to the receiving device's local storage (`Download/AuraDrop` on Android, or the user's configured Downloads directory on Windows/macOS).
- **Integrity Verification:** Hardware-accelerated SHA-256 cryptographic hashes are computed locally on both devices to verify bit-level file integrity. Hashes are never transmitted outside your local network.

### B. Device Discovery (UDP Multicast / Broadcast)
- **Local Beacons:** To discover other AuraDrop instances on your local network, the app broadcasts minimal unencrypted UDP packets on multicast address `224.0.0.167:53317` and local subnet broadcast.
- **Beacon Payload:** The beacon payload (`AURADROP/1`) includes only:
  - Your chosen device display name (e.g., "Galaxy S24 Ultra", "My Windows PC")
  - Platform identifier (e.g., `android`, `windows`, `macos`)
  - Local LAN IP address and port (e.g., `192.168.1.50:53317`)
  - Ephemeral session ID
- **Scope:** Discovery packets are restricted to your physical local subnet and cannot traverse the wider internet.

### C. Local History & Storage (SQLite / LocalStorage)
- **Local Logs:** Transfer history (file names, sizes, timestamps, peer names, and transfer completion status) is saved in a local SQLite database (on Android) or local application storage (on Desktop/Web).
- **User Control:** Transfer logs remain strictly on your physical device. You can clear or delete your entire transfer history at any time from the app Settings.

---

## 3. Device Permissions & Why They Are Needed

### Android Application Permissions
| Permission | Technical Name | Purpose |
| :--- | :--- | :--- |
| **Nearby Wi-Fi Devices** | `android.permission.NEARBY_WIFI_DEVICES` | Required on Android 13+ to discover and connect to peer devices on the same Wi-Fi network without requiring location access. |
| **Location Access** | `android.permission.ACCESS_FINE_LOCATION` | Required by older Android versions to discover Wi-Fi hardware interfaces and obtain the local Wi-Fi IP address. AuraDrop never tracks your GPS location. |
| **Storage / Media Access** | `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE` | Allows you to select files from your gallery/storage for sending, and writes incoming files directly to your `Download/AuraDrop` directory. |
| **Foreground Service** | `android.permission.FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` | Keeps large file transfers active and unthrottled when the screen is locked or when switching between apps. |
| **Notifications** | `android.permission.POST_NOTIFICATIONS` | Displays real-time transfer progress, MB/s speed, and incoming transfer accept/decline actions. |
| **System Alert Window** | `android.permission.SYSTEM_ALERT_WINDOW` | Optional permission enabling the quick AirDrop dynamic proximity pill overlay on home screen and over other apps when a peer is nearby. |

### Desktop Application (Windows / macOS)
- **Local Network / Firewall:** AuraDrop requests inbound and outbound local network socket binding for UDP and TCP on port `53317` to facilitate LAN communication.
- **File System Access:** AuraDrop accesses only files you explicitly select for sending, and writes received files to your system `Downloads/AuraDrop` folder.

---

## 4. Third-Party Services & Links

- **No Third-Party SDKs:** AuraDrop does not include Google Analytics, Firebase, Facebook SDK, Crashlytics, AdMob, or any tracking SDKs.
- **Voluntary Donations ("Buy Me a Coffee"):** The application includes an optional external link to our Buy Me a Coffee page (`https://buymeacoffee.com/auradrop`). If you choose to support the project, payment processing occurs entirely on BuyMeACoffee.com's secure external website subject to their privacy policy. AuraDrop never collects, processes, or stores your credit card or financial information.
- **OTA Updates (GitHub Releases):** Optional update checks query public GitHub release tags (`https://api.github.com/repos/JACK-AI7/AuraDrop/releases`) solely to notify you when a new version is available.

---

## 5. Data Security

Because AuraDrop uses direct point-to-point communication over your private local network:
1. Data never transits public cloud infrastructure.
2. File transfers are immune to remote cloud data breaches or server outages.
3. Every transfer requires explicit user confirmation (Accept/Decline) before incoming bytes are written to disk.

---

## 6. Children's Privacy

AuraDrop does not collect any personal information from anyone, including children under the age of 13.

---

## 7. Changes to This Privacy Policy

If we modify this policy, the updated version will be posted in the application Settings, our source repository, and our official website with a revised effective date.

---

## 8. Contact & Open Source Verification

AuraDrop is an open, auditable software project. You can inspect the complete source code, audit all network calls, or reach out to the maintainers at:

- **Repository & Issue Tracker:** [https://github.com/JACK-AI7/AuraDrop](https://github.com/JACK-AI7/AuraDrop)  
- **Maintainer:** AuraDrop Open Source Project Team  
- **Support & Coffee:** [https://buymeacoffee.com/auradrop](https://buymeacoffee.com/auradrop)
