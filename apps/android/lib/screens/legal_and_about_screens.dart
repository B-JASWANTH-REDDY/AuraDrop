import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/native_bridge.dart';
import '../services/aura_lan_server.dart';
import '../services/aura_discovery_service.dart';
import '../services/aura_identity_service.dart';
import '../theme/aura_theme.dart';
import '../components/minimal_components.dart';

class AboutAuraDropScreen extends StatelessWidget {
  const AboutAuraDropScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'About AuraDrop',
          style: TextStyle(
            color: theme.textPrimary,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 12),
            // Official AuraDrop Logo
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: theme.border, width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Image.asset(
                  'assets/logo.png',
                  fit: BoxFit.cover,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'AuraDrop',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: theme.textPrimary,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Version 2.0.1 (Build 4)',
              style: TextStyle(
                fontSize: 12,
                color: theme.textSecondary,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: theme.subtleHighlight,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: theme.border, width: 0.8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: Color(0xFF10B981),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '100% Local Peer-to-Peer • Zero Cloud',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: theme.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // Product Info Card
            MinimalCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildMetaRow('Product', 'AuraDrop for Mobile', theme),
                  Divider(color: theme.border, height: 20),
                  _buildMetaRow('Version', '2.0.1 (Production)', theme),
                  Divider(color: theme.border, height: 20),
                  _buildMetaRow('Lead Engineer', 'B.JASWANTH REDDY', theme),
                  Divider(color: theme.border, height: 20),
                  _buildMetaRow('License', 'MIT Open Source License', theme),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Navigation Links Card
            MinimalCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _buildNavTile(
                    icon: Icons.shield_outlined,
                    title: 'Privacy Policy',
                    subtitle: 'Zero data collection, local network only',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.description_outlined,
                    title: 'Terms of Service',
                    subtitle: 'Acceptable use and local network terms',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const TermsOfServiceScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.article_outlined,
                    title: 'Software License (EULA)',
                    subtitle: 'MIT License terms and end-user agreements',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const EulaScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.code_rounded,
                    title: 'Third-Party Open Source Notices',
                    subtitle: 'Flutter, Rust, Tauri, Tokio licenses',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ThirdPartyLicensesScreen()),
                    ),
                    theme: theme,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Support & Coffee Card
            MinimalCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.coffee_rounded, color: Color(0xFFFFDD00), size: 22),
                      const SizedBox(width: 10),
                      Text(
                        'Support AuraDrop Development',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: theme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'AuraDrop is 100% free, ad-free, and open source. If AuraDrop saves you time, consider buying a coffee to support continuous development.',
                    style: TextStyle(
                      fontSize: 12,
                      color: theme.textSecondary,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFFDD00),
                        foregroundColor: const Color(0xFF000000),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.coffee_rounded, size: 18),
                      label: const Text(
                        'Buy Me a Coffee',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                      ),
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        showBuyMeACoffeeSheet(context, theme);
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
            Text(
              'Built by B.JASWANTH REDDY\nCopyright © 2026 B.JASWANTH REDDY. All Rights Reserved.\nReleased under the MIT License.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: theme.textSecondary, height: 1.5),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  static Widget _buildMetaRow(String label, String value, AuraTheme theme) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: theme.textSecondary)),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: theme.textPrimary,
              fontFamily: 'monospace',
            ),
          ),
        ),
      ],
    );
  }

  static Widget _buildNavTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    required AuraTheme theme,
  }) {
    return InkWell(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: theme.textPrimary),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: theme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 11, color: theme.textSecondary),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios_rounded, size: 14, color: theme.textSecondary),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// PRIVACY POLICY SCREEN
// ---------------------------------------------------------------------------
class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'Privacy Policy',
          style: TextStyle(color: theme.textPrimary, fontSize: 17, fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildBadge('Effective Date: October 9, 2026 • v2.0.1', theme),
            const SizedBox(height: 16),
            _buildParagraph(
              'AuraDrop is designed as a local-first, peer-to-peer (P2P) file sharing and messaging tool. Your files and personal data belong exclusively to you.',
              theme,
            ),
            const SizedBox(height: 20),
            _buildHeading('1. Zero Cloud Uploads', theme),
            _buildParagraph(
              'Files, media, and chat messages transferred via AuraDrop move directly from sender device to receiver device over your local physical Wi-Fi or wired network. Data is never routed through, stored on, or inspected by intermediate cloud servers.',
              theme,
            ),
            const SizedBox(height: 16),
            _buildHeading('2. Zero Telemetry & Tracking', theme),
            _buildParagraph(
              'AuraDrop does not collect, record, or transmit analytics, device identifiers, IP logs, or behavioral telemetry. No tracking SDKs (such as Google Analytics, Firebase, or Facebook SDK) exist in this application.',
              theme,
            ),
            const SizedBox(height: 16),
            _buildHeading('3. Local Discovery (UDP Multicast)', theme),
            _buildParagraph(
              'Device discovery is performed using UDP multicast beacons on address 224.0.0.167:53317. Discovery packets contain only your chosen device display name, platform type, and local IP:port. Discovery packets cannot leave your physical subnet.',
              theme,
            ),
            const SizedBox(height: 16),
            _buildHeading('4. Storage & Local History', theme),
            _buildParagraph(
              'Transfer history and peer metadata are stored locally in an on-device SQLite database. You can clear this history anytime in Settings. Received downloads are placed directly into your device\'s Download/AuraDrop folder.',
              theme,
            ),
            const SizedBox(height: 16),
            _buildHeading('5. Voluntary Support Donations', theme),
            _buildParagraph(
              'If you choose to support the project via Buy Me a Coffee, payment processing occurs on BuyMeACoffee.com\'s external website subject to their privacy policy. AuraDrop never receives, processes, or stores your financial information.',
              theme,
            ),
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }

  static Widget _buildBadge(String text, AuraTheme theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: theme.subtleHighlight,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: theme.border, width: 0.8),
      ),
      child: Text(text, style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: theme.textSecondary)),
    );
  }

  static Widget _buildHeading(String title, AuraTheme theme) {
    return Text(
      title,
      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: theme.textPrimary),
    );
  }

  static Widget _buildParagraph(String text, AuraTheme theme) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        text,
        style: TextStyle(fontSize: 13, color: theme.textSecondary, height: 1.5),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// TERMS OF SERVICE SCREEN
// ---------------------------------------------------------------------------
class TermsOfServiceScreen extends StatelessWidget {
  const TermsOfServiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'Terms of Service',
          style: TextStyle(color: theme.textPrimary, fontSize: 17, fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PrivacyPolicyScreen._buildBadge('Effective Date: October 9, 2026 • v2.0.1', theme),
            const SizedBox(height: 16),
            PrivacyPolicyScreen._buildParagraph(
              'By installing or using AuraDrop, you agree to be bound by these Terms of Service. If you disagree, do not use the application.',
              theme,
            ),
            const SizedBox(height: 20),
            PrivacyPolicyScreen._buildHeading('1. Service Description', theme),
            PrivacyPolicyScreen._buildParagraph(
              'AuraDrop is an open-source, local-first software utility providing point-to-point file transfers across devices on your local network. It does not provide cloud storage, remote backup, or internet relay services.',
              theme,
            ),
            const SizedBox(height: 16),
            PrivacyPolicyScreen._buildHeading('2. Acceptable Use', theme),
            PrivacyPolicyScreen._buildParagraph(
              'You agree not to use AuraDrop to transmit illegal materials, malware, ransomware, or infringing content. You are solely responsible for all content sent and received via your devices.',
              theme,
            ),
            const SizedBox(height: 16),
            PrivacyPolicyScreen._buildHeading('3. Disclaimer of Warranties', theme),
            PrivacyPolicyScreen._buildParagraph(
              'AURADROP IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE MAINTAINERS DO NOT WARRANT UNINTERRUPTED OR ERROR-FREE LOCAL FILE TRANSMISSION.',
              theme,
            ),
            const SizedBox(height: 16),
            PrivacyPolicyScreen._buildHeading('4. Limitation of Liability', theme),
            PrivacyPolicyScreen._buildParagraph(
              'IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OF OR INABILITY TO USE AURADROP.',
              theme,
            ),
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// EULA & SOFTWARE LICENSE SCREEN
// ---------------------------------------------------------------------------
class EulaScreen extends StatelessWidget {
  const EulaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'Software License (EULA)',
          style: TextStyle(color: theme.textPrimary, fontSize: 17, fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PrivacyPolicyScreen._buildBadge('MIT License • Version 2.0.1', theme),
            const SizedBox(height: 16),
            Text(
              'Copyright (c) 2026 AuraDrop Contributors',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: theme.textPrimary),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.subtleHighlight,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: theme.border, width: 0.8),
              ),
              child: Text(
                'Permission is hereby granted, free of charge, to any person obtaining a copy '
                'of this software and associated documentation files (the "Software"), to deal '
                'in the Software without restriction, including without limitation the rights '
                'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell '
                'copies of the Software, and to permit persons to whom the Software is '
                'furnished to do so, subject to the following conditions:\n\n'
                'The above copyright notice and this permission notice shall be included in all '
                'copies or substantial portions of the Software.\n\n'
                'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR '
                'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, '
                'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE '
                'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER '
                'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, '
                'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE '
                'SOFTWARE.',
                style: TextStyle(fontSize: 11.5, fontFamily: 'monospace', color: theme.textPrimary, height: 1.5),
              ),
            ),
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// THIRD-PARTY LICENSES SCREEN
// ---------------------------------------------------------------------------
class ThirdPartyLicensesScreen extends StatelessWidget {
  const ThirdPartyLicensesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    final libs = [
      {'name': 'Flutter Framework', 'license': 'BSD 3-Clause', 'desc': 'Cross-platform UI toolkit by Google'},
      {'name': 'Cupertino Icons', 'license': 'MIT', 'desc': 'iOS style asset icons'},
      {'name': 'Crypto', 'license': 'BSD 3-Clause', 'desc': 'SHA-256 cryptographic hashing'},
      {'name': 'Path Provider', 'license': 'BSD 3-Clause', 'desc': 'Local filesystem directory resolution'},
      {'name': 'File Picker', 'license': 'MIT', 'desc': 'Native file and folder picking'},
      {'name': 'Tauri 2 Framework', 'license': 'Apache-2.0 / MIT', 'desc': 'Lightweight desktop engine and runtime'},
      {'name': 'Tokio & Axum', 'license': 'MIT', 'desc': 'Asynchronous Rust TCP streaming engine'},
      {'name': 'Lucide Icons', 'license': 'ISC', 'desc': 'Vector icon set for UI design'},
      {'name': 'Three.js', 'license': 'MIT', 'desc': 'Monochrome 3D globe visualization'},
    ];

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'Third-Party Licenses',
          style: TextStyle(color: theme.textPrimary, fontSize: 17, fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        itemCount: libs.length,
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (ctx, i) {
          final lib = libs[i];
          return MinimalCard(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lib['name']!,
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: theme.textPrimary),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        lib['desc']!,
                        style: TextStyle(fontSize: 11, color: theme.textSecondary),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: theme.subtleHighlight,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: theme.border, width: 0.8),
                  ),
                  child: Text(
                    lib['license']!,
                    style: TextStyle(fontSize: 10.5, fontFamily: 'monospace', fontWeight: FontWeight.w600, color: theme.textPrimary),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// DEVICE INFORMATION SCREEN
// ---------------------------------------------------------------------------
class DeviceInformationScreen extends StatefulWidget {
  const DeviceInformationScreen({super.key});

  @override
  State<DeviceInformationScreen> createState() => _DeviceInformationScreenState();
}

class _DeviceInformationScreenState extends State<DeviceInformationScreen> {
  Map<String, dynamic>? _info;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    final info = await NativeBridgeService.getDeviceInfo();
    if (mounted) {
      setState(() {
        _info = info;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'Device Information',
          style: TextStyle(color: theme.textPrimary, fontSize: 17, fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator(strokeWidth: 2, color: theme.textPrimary))
          : SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                children: [
                  MinimalCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        AboutAuraDropScreen._buildMetaRow('Device Name', _info?['deviceName']?.toString() ?? 'This Phone', theme),
                        Divider(color: theme.border, height: 20),
                        AboutAuraDropScreen._buildMetaRow('Device ID', _info?['deviceId']?.toString() ?? AuraIdentityService().deviceId, theme),
                        Divider(color: theme.border, height: 20),
                        AboutAuraDropScreen._buildMetaRow('Physical IP', AuraLanServer().localIp, theme),
                        Divider(color: theme.border, height: 20),
                        AboutAuraDropScreen._buildMetaRow('Server Port', '${AuraLanServer().port}', theme),
                        Divider(color: theme.border, height: 20),
                        AboutAuraDropScreen._buildMetaRow('Platform', _info?['platform']?.toString() ?? 'android', theme),
                        Divider(color: theme.border, height: 20),
                        AboutAuraDropScreen._buildMetaRow('Discovery Port', '${AuraDiscoveryService.discoveryPort}', theme),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

// ---------------------------------------------------------------------------
// HELP & SUPPORT SCREEN
// ---------------------------------------------------------------------------
class HelpAndSupportScreen extends StatelessWidget {
  const HelpAndSupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: theme.background,
        elevation: 0,
        title: Text(
          'Help & Troubleshooting',
          style: TextStyle(color: theme.textPrimary, fontSize: 17, fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: theme.textPrimary, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildFaqItem(
              'Devices not appearing on radar?',
              '1. Ensure both devices are connected to the exact same Wi-Fi router / SSID.\n'
              '2. Check that "AP Isolation" or "Client Isolation" is turned OFF in your router settings.\n'
              '3. On Windows, make sure AuraDrop is permitted through Windows Defender Firewall for Port 53317 (UDP/TCP).\n'
              '4. Tap "Force Subnet Announce" in Network Diagnostics.',
              theme,
            ),
            const SizedBox(height: 12),
            _buildFaqItem(
              'Does AuraDrop require an active Internet connection?',
              'No! AuraDrop transfers files entirely offline over your local Wi-Fi or mobile hotspot. The internet connection can be completely off.',
              theme,
            ),
            const SizedBox(height: 12),
            _buildFaqItem(
              'Where are received files saved?',
              'On Android, files are saved directly into your device\'s Download/AuraDrop directory, which is instantly accessible in your Files app and Gallery.',
              theme,
            ),
            const SizedBox(height: 20),
            MinimalCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Need More Help?', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: theme.textPrimary)),
                  const SizedBox(height: 6),
                  Text('Submit an issue or read technical documentation on our open repository.', style: TextStyle(fontSize: 12, color: theme.textSecondary)),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: theme.textPrimary,
                        side: BorderSide(color: theme.border),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      icon: const Icon(Icons.open_in_new_rounded, size: 16),
                      label: const Text('Open GitHub Repository', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        NativeBridgeService.openUrl('https://github.com/JACK-AI7/AuraDrop');
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }

  static Widget _buildFaqItem(String question, String answer, AuraTheme theme) {
    return MinimalCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.help_outline_rounded, size: 18, color: theme.textPrimary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  question,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: theme.textPrimary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            answer,
            style: TextStyle(fontSize: 12, color: theme.textSecondary, height: 1.5),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// BUY ME A COFFEE MODAL SHEET
// ---------------------------------------------------------------------------
void showBuyMeACoffeeSheet(BuildContext context, AuraTheme theme) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: theme.cardBackground,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: theme.border, width: 1.0),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: theme.textSecondary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: const Color(0xFFFFDD00),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.coffee_rounded, size: 30, color: Color(0xFF000000)),
            ),
            const SizedBox(height: 14),
            Text(
              'Support AuraDrop',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: theme.textPrimary),
            ),
            const SizedBox(height: 6),
            Text(
              'Direct Contribution • 100% Free & Open-Source',
              style: TextStyle(fontSize: 12, color: theme.textSecondary),
            ),
            const SizedBox(height: 14),
            Text(
              'AuraDrop is completely free and open-source with zero ads, tracking, or cloud servers. Direct contributions support continuous development and maintenance.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: theme.textSecondary, height: 1.5),
            ),
            const SizedBox(height: 16),
            // Direct UPI ID Card
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: theme.subtleHighlight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.border, width: 1.0),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'DIRECT UPI ID (BHIM / PhonePe / GPay)',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                            color: theme.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const SelectableText(
                          '9182769225@ybl',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            fontFamily: 'monospace',
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    icon: const Icon(Icons.copy_rounded, size: 14, color: Colors.black),
                    label: const Text('Copy', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    onPressed: () {
                      Clipboard.setData(const ClipboardData(text: '9182769225@ybl'));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('UPI ID (9182769225@ybl) copied to clipboard'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildCoffeeTier(Icons.coffee_rounded, const Color(0xFFFFDD00), '1 Coffee', '₹50 / \$1', theme),
                const SizedBox(width: 8),
                _buildCoffeeTier(Icons.auto_awesome_rounded, const Color(0xFFFBBF24), '3 Coffees', '₹150 / \$3', theme),
                const SizedBox(width: 8),
                _buildCoffeeTier(Icons.favorite_rounded, const Color(0xFFF43F5E), 'Supporter', '₹500 / \$10', theme),
              ],
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFDD00),
                  foregroundColor: const Color(0xFF000000),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
                icon: const Icon(Icons.account_balance_wallet_rounded, size: 18),
                label: const Text(
                  'Pay via UPI App (GPay / PhonePe / Paytm)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                ),
                onPressed: () async {
                  Navigator.pop(ctx);
                  await NativeBridgeService.openUrl('upi://pay?pa=9182769225@ybl&pn=B%20JASWANTH%20REDDY&cu=INR');
                },
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Opens your default UPI app directly. 100% goes to the developer.',
              style: TextStyle(fontSize: 10, color: theme.textSecondary),
            ),
          ],
        ),
      ),
    ),
  );
}

Widget _buildCoffeeTier(IconData icon, Color iconColor, String title, String price, AuraTheme theme) {
  return Container(
    width: 96,
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
    decoration: BoxDecoration(
      color: theme.subtleHighlight,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: theme.border, width: 0.8),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20, color: iconColor),
        const SizedBox(height: 6),
        Text(title, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: theme.textPrimary)),
        const SizedBox(height: 3),
        Text(price, style: TextStyle(fontSize: 10, fontFamily: 'monospace', color: theme.textSecondary)),
      ],
    ),
  );
}
