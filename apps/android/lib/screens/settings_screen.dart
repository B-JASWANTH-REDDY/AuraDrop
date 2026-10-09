import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/models.dart';
import '../services/native_bridge.dart';
import '../services/profile_repository.dart';
import '../services/aura_update_service.dart';
import '../theme/aura_theme.dart';
import '../components/minimal_components.dart';
import 'legal_and_about_screens.dart';

class SettingsScreen extends StatefulWidget {
  final VisibilityMode currentVisibility;
  final Function(VisibilityMode) onVisibilityChanged;
  final int temporarySecondsRemaining;
  final Color accentColor;
  final AnimationSettings animationSettings;
  final Function(AnimationSettings) onAnimationSettingsChanged;
  final String currentThemeMode;
  final Function(String)? onThemeModeChanged;

  const SettingsScreen({
    super.key,
    required this.currentVisibility,
    required this.onVisibilityChanged,
    required this.temporarySecondsRemaining,
    required this.accentColor,
    required this.animationSettings,
    required this.onAnimationSettingsChanged,
    this.currentThemeMode = 'system',
    this.onThemeModeChanged,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late String _selectedThemeMode;
  late VisibilityMode _selectedVisibilityMode;
  late AnimationSettings _selectedAnimationSettings;
  List<Map<String, dynamic>> _trustedPeers = [];
  List<BlockedPeer> _blockedPeers = [];
  bool _isLoadingPeers = true;
  bool _backgroundDiscovery = true;
  bool _allowNearbyRequests = true;
  bool _isCheckingUpdate = false;
  bool _hasOverlayPermission = true;
  bool _hasBatteryExemption = true;

  @override
  void initState() {
    super.initState();
    _selectedThemeMode = widget.currentThemeMode;
    _selectedVisibilityMode = widget.currentVisibility;
    _selectedAnimationSettings = widget.animationSettings;
    _loadAllData();
  }

  Future<void> _loadAllData() async {
    final trusted = await NativeBridgeService.getTrustedPeers();
    final blocked = await NativeBridgeService.getBlockedPeers();
    final profile = await ProfileRepository().loadProfile();
    final hasOverlay = await NativeBridgeService.checkOverlayPermission();
    final hasBattery = await NativeBridgeService.checkBatteryOptimizationExempt();

    if (mounted) {
      setState(() {
        _trustedPeers = trusted;
        _blockedPeers = blocked;
        _isLoadingPeers = false;
        _hasOverlayPermission = hasOverlay;
        _hasBatteryExemption = hasBattery;
        if (profile.theme.isNotEmpty) {
          _selectedThemeMode = profile.theme;
        }
        if (profile.visibility.isNotEmpty) {
          _selectedVisibilityMode = VisibilityMode.values.firstWhere(
            (v) => v.name.toLowerCase() == profile.visibility.toLowerCase(),
            orElse: () => _selectedVisibilityMode,
          );
        }
      });
    }
  }

  Future<void> _removeTrust(String peerId, String name) async {
    HapticFeedback.lightImpact();
    await NativeBridgeService.setPeerTrusted(peerId, name, false);
    _loadAllData();
  }

  Future<void> _unblockPeer(String peerId, String name) async {
    HapticFeedback.lightImpact();
    await NativeBridgeService.setPeerBlocked(peerId, name, false);
    _loadAllData();
  }

  Future<void> _clearAllHistory(AuraTheme theme) async {
    HapticFeedback.mediumImpact();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: theme.cardBackground,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: theme.border),
        ),
        title: Text(
          'Clear History',
          style: TextStyle(color: theme.textPrimary, fontWeight: FontWeight.w700, fontSize: 16),
        ),
        content: Text(
          'This will remove all transfer records from the local SQLite log. Received files in your device storage will not be deleted.',
          style: TextStyle(color: theme.textSecondary, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: theme.textSecondary)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Clear', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    final ok = await NativeBridgeService.clearTransferHistory();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'Transfer history cleared' : 'Error clearing history'),
          backgroundColor: ok ? theme.textPrimary : const Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _updateSettings(AnimationSettings newSettings) {
    setState(() {
      _selectedAnimationSettings = newSettings;
    });
    widget.onAnimationSettingsChanged(newSettings);
    NativeBridgeService.saveUserProfile(
      'reduced_motion',
      newSettings.reducedMotion ? '1' : '0',
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);

    return Container(
      color: theme.background,
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag Handle for bottom sheet
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: theme.textSecondary.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header
            Text(
              'Settings',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: theme.textPrimary,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Manage network visibility, background discovery, and storage.',
              style: TextStyle(fontSize: 12, color: theme.textSecondary),
            ),
            const SizedBox(height: 24),

            // Appearance Section
            _buildSectionHeader('Appearance', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Theme Mode',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textPrimary),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _buildThemeOption('System', 'system', Icons.brightness_auto, theme),
                      const SizedBox(width: 8),
                      _buildThemeOption('Light', 'light', Icons.light_mode, theme),
                      const SizedBox(width: 8),
                      _buildThemeOption('Dark', 'dark', Icons.dark_mode, theme),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Nearby Visibility Section
            _buildSectionHeader('Nearby Visibility', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _buildVisibilityTile(
                    'Everyone Nearby',
                    'Discoverable by all devices on current local network',
                    VisibilityMode.everyoneNearby,
                    theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildVisibilityTile(
                    'Everyone for 10 Minutes',
                    _selectedVisibilityMode == VisibilityMode.temporaryEveryone
                        ? 'Reverting in ${widget.temporarySecondsRemaining ~/ 60}:${(widget.temporarySecondsRemaining % 60).toString().padLeft(2, '0')}'
                        : 'Temporarily discoverable, then reverts to Contacts',
                    VisibilityMode.temporaryEveryone,
                    theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildVisibilityTile(
                    'Contacts & Trusted Only',
                    'Only devices you have previously paired or starred',
                    VisibilityMode.contactsOnly,
                    theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildVisibilityTile(
                    'Receiving Off',
                    'Invisible to all nearby devices',
                    VisibilityMode.receivingOff,
                    theme,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Background & System Services
            _buildSectionHeader('System & Background Sharing', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  _buildSwitchRow(
                    'Background Discovery',
                    'Keep Wi-Fi Direct and LAN beacon active when app is minimized',
                    _backgroundDiscovery,
                    (v) {
                      setState(() => _backgroundDiscovery = v);
                      NativeBridgeService.saveUserProfile('background_discovery', v ? '1' : '0');
                    },
                    theme,
                  ),
                  Divider(color: theme.border, height: 20),
                  _buildSwitchRow(
                    'Allow Nearby Requests',
                    'Show system notification with Accept/Decline outside of app',
                    _allowNearbyRequests,
                    (v) {
                      setState(() => _allowNearbyRequests = v);
                      NativeBridgeService.saveUserProfile('allow_nearby_requests', v ? '1' : '0');
                    },
                    theme,
                  ),
                  Divider(color: theme.border, height: 20),
                  InkWell(
                    onTap: () async {
                      HapticFeedback.lightImpact();
                      await NativeBridgeService.requestBatteryOptimizationExempt();
                      _loadAllData();
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '24/7 Background Service',
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textPrimary),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Unrestricted battery access so nearby devices are detected 24/7',
                                  style: TextStyle(fontSize: 11, color: theme.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _hasBatteryExemption ? const Color(0xFF10B981).withOpacity(0.15) : const Color(0xFFF59E0B).withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: _hasBatteryExemption ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                                width: 0.8,
                              ),
                            ),
                            child: Text(
                              _hasBatteryExemption ? 'ACTIVE' : 'GRANT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: _hasBatteryExemption ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Divider(color: theme.border, height: 20),
                  InkWell(
                    onTap: () async {
                      HapticFeedback.lightImpact();
                      await NativeBridgeService.requestOverlayPermission();
                      _loadAllData();
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Display Over Other Apps',
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textPrimary),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Shows floating AirDrop island on Home Screen, Lock Screen & other apps',
                                  style: TextStyle(fontSize: 11, color: theme.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _hasOverlayPermission ? const Color(0xFF10B981).withOpacity(0.15) : const Color(0xFFF59E0B).withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: _hasOverlayPermission ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                                width: 0.8,
                              ),
                            ),
                            child: Text(
                              _hasOverlayPermission ? 'ACTIVE' : 'GRANT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: _hasOverlayPermission ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Motion & Performance
            _buildSectionHeader('Motion & Performance', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Effect Tier',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textPrimary),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _buildTierButton('Performance', 'Minimal', AnimationQuality.minimal, theme),
                      const SizedBox(width: 8),
                      _buildTierButton('Balanced', 'Smooth', AnimationQuality.balanced, theme),
                      const SizedBox(width: 8),
                      _buildTierButton('Immersive', '60 FPS', AnimationQuality.immersive, theme),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Divider(color: theme.border, height: 1),
                  const SizedBox(height: 8),
                  _buildSwitchRow(
                    'Reduced Motion',
                    'Disable 3D sphere spin momentum and edge wave animations',
                    _selectedAnimationSettings.reducedMotion,
                    (v) => _updateSettings(_selectedAnimationSettings.copyWith(reducedMotion: v)),
                    theme,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Blocked Peers Section
            _buildSectionHeader('Blocked Peers', theme),
            const SizedBox(height: 8),
            if (_isLoadingPeers)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: theme.textPrimary),
                  ),
                ),
              )
            else if (_blockedPeers.isEmpty)
              MinimalCard(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(
                    'No blocked peers',
                    style: TextStyle(fontSize: 12, color: theme.textSecondary),
                  ),
                ),
              )
            else
              Column(
                children: _blockedPeers.map((b) {
                  return MinimalCard(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Icon(Icons.block_rounded, color: theme.error, size: 18),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                b.peerName,
                                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: theme.textPrimary),
                              ),
                              Text(
                                'Blocked since ${b.blockedSince.toLocal().toString().split(' ')[0]}',
                                style: TextStyle(fontSize: 10, color: theme.textSecondary),
                              ),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () => _unblockPeer(b.peerId, b.peerName),
                          child: Text(
                            'Unblock',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: theme.textPrimary),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            const SizedBox(height: 24),

            // Trusted Devices Section
            _buildSectionHeader('Trusted Devices', theme),
            const SizedBox(height: 8),
            if (_trustedPeers.isEmpty)
              MinimalCard(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(
                    'No trusted peers saved yet',
                    style: TextStyle(fontSize: 12, color: theme.textSecondary),
                  ),
                ),
              )
            else
              Column(
                children: _trustedPeers.map((p) {
                  final name = p['peerName']?.toString() ?? 'Device';
                  final id = p['peerId']?.toString() ?? '';
                  return MinimalCard(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Icon(Icons.verified_outlined, color: theme.textPrimary, size: 18),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            name,
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: theme.textPrimary),
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.close_rounded, color: theme.textSecondary, size: 18),
                          onPressed: () => _removeTrust(id, name),
                          tooltip: 'Remove Trust',
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            const SizedBox(height: 24),

            // Storage Section
            _buildSectionHeader('Storage & History', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.storage_outlined, size: 18, color: theme.textPrimary),
                      const SizedBox(width: 8),
                      Text(
                        'Local SQLite Database',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textPrimary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Transfer logs and peer metadata are stored locally on device. Received downloads are saved to /sdcard/Download/AuraDrop.',
                    style: TextStyle(fontSize: 12, color: theme.textSecondary, height: 1.4),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFEF4444),
                      side: const BorderSide(color: Color(0xFFEF4444), width: 0.8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    ),
                    onPressed: () => _clearAllHistory(theme),
                    icon: const Icon(Icons.delete_sweep_outlined, size: 16),
                    label: const Text('Clear Transfer History', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),



            // Over-The-Air (OTA) Software Updates Section
            _buildSectionHeader('Over-The-Air (OTA) Updates', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.system_update_rounded, color: theme.textPrimary, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'AuraDrop OTA Software',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: theme.textPrimary),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: theme.subtleHighlight,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: theme.border, width: 0.8),
                        ),
                        child: Text(
                          'v${AuraUpdateService.currentVersion}',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: theme.textPrimary),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Direct wireless updates over the air from official GitHub Releases.',
                    style: TextStyle(fontSize: 12, color: theme.textSecondary),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: MinimalButton(
                      text: _isCheckingUpdate ? 'Checking for Updates...' : 'Check for Updates Now',
                      icon: _isCheckingUpdate ? null : Icons.refresh_rounded,
                      onPressed: _isCheckingUpdate ? () {} : () => _checkForOtaUpdates(context, theme),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Support & Coffee Section
            _buildSectionHeader('Support AuraDrop', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.coffee_rounded, color: Color(0xFFFFDD00), size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'Buy Me a Coffee',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: theme.textPrimary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'AuraDrop is 100% free and open-source. Voluntary tips support continuous updates and development.',
                    style: TextStyle(fontSize: 12, color: theme.textSecondary, height: 1.4),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFFDD00),
                        foregroundColor: const Color(0xFF000000),
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.coffee_rounded, size: 16),
                      label: const Text('Support AuraDrop', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        showBuyMeACoffeeSheet(context, theme);
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Legal & About Section
            _buildSectionHeader('Product & Legal', theme),
            const SizedBox(height: 8),
            MinimalCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _buildNavTile(
                    icon: Icons.info_outline_rounded,
                    title: 'About AuraDrop',
                    subtitle: 'v2.0.1 (Build 4) • Fast Local P2P AirDrop',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AboutAuraDropScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.devices_other_rounded,
                    title: 'Device Information',
                    subtitle: 'Local IP, interfaces, and ports',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const DeviceInformationScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.help_outline_rounded,
                    title: 'Help & Support',
                    subtitle: 'Troubleshooting and connection FAQ',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const HelpAndSupportScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.shield_outlined,
                    title: 'Privacy Policy',
                    subtitle: 'Local-only data practices & zero cloud',
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
                    subtitle: 'Acceptable use & license terms',
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
                    subtitle: 'MIT Open-Source License',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const EulaScreen()),
                    ),
                    theme: theme,
                  ),
                  Divider(color: theme.border, height: 1),
                  _buildNavTile(
                    icon: Icons.code_rounded,
                    title: 'Third-Party Open-Source Notices',
                    subtitle: 'Credits and open source licenses',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ThirdPartyLicensesScreen()),
                    ),
                    theme: theme,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Future<void> _checkForOtaUpdates(BuildContext context, AuraTheme theme) async {
    setState(() => _isCheckingUpdate = true);
    final info = await AuraUpdateService().checkForUpdate();
    if (!mounted || !context.mounted) return;
    setState(() => _isCheckingUpdate = false);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: theme.cardBackground,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          border: Border.all(color: theme.border, width: 1.0),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    info.hasUpdate ? Icons.system_update_rounded : Icons.check_circle_rounded,
                    color: info.hasUpdate ? const Color(0xFF10B981) : theme.textPrimary,
                    size: 24,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    info.hasUpdate ? 'Update Available!' : 'Up to Date',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: theme.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                info.hasUpdate
                    ? 'A newer version of AuraDrop (v${info.latestVersion}) is available. Current installed: v${info.currentVersion}.'
                    : 'AuraDrop v${info.currentVersion} is currently the latest production version.',
                style: TextStyle(fontSize: 13, color: theme.textSecondary, height: 1.4),
              ),
              const SizedBox(height: 12),
              if (info.releaseNotes.isNotEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.subtleHighlight,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: theme.border, width: 0.8),
                  ),
                  child: Text(
                    info.releaseNotes,
                    style: TextStyle(fontSize: 12, color: theme.textPrimary, height: 1.3),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              if (info.hasUpdate && info.downloadUrl.isNotEmpty) ...[
                MinimalButton(
                  text: 'Download & Install v${info.latestVersion}',
                  icon: Icons.download_rounded,
                  onPressed: () async {
                    Navigator.pop(ctx);
                    await NativeBridgeService.openFile(info.downloadUrl);
                  },
                ),
              ] else ...[
                MinimalButton(
                  text: 'Close',
                  isPrimary: false,
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, AuraTheme theme) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: theme.textSecondary,
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _buildNavTile({
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
            Icon(Icons.arrow_forward_ios_rounded, size: 13, color: theme.textSecondary),
          ],
        ),
      ),
    );
  }

  Widget _buildThemeOption(String label, String value, IconData icon, AuraTheme theme) {
    final isSelected = _selectedThemeMode == value;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          setState(() {
            _selectedThemeMode = value;
          });
          widget.onThemeModeChanged?.call(value);
          ProfileRepository().updateTheme(value);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? theme.textPrimary : theme.cardBackground,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? theme.textPrimary : theme.border,
              width: 1,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 16,
                color: isSelected ? theme.actionText : theme.textSecondary,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? theme.actionText : theme.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVisibilityTile(String title, String subtitle, VisibilityMode mode, AuraTheme theme) {
    final isSelected = _selectedVisibilityMode == mode;
    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() {
          _selectedVisibilityMode = mode;
        });
        widget.onVisibilityChanged(mode);
        final modeString = mode.name;
        ProfileRepository().updateVisibility(modeString);
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                      color: theme.textPrimary,
                      fontSize: 13,
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
            const SizedBox(width: 8),
            Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? theme.textPrimary : theme.textSecondary.withValues(alpha: 0.5),
                  width: 1.5,
                ),
                color: isSelected ? theme.textPrimary : Colors.transparent,
              ),
              child: isSelected
                  ? Icon(Icons.check, size: 12, color: theme.actionText)
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTierButton(String title, String subtitle, AnimationQuality q, AuraTheme theme) {
    final isSelected = _selectedAnimationSettings.quality == q;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          _updateSettings(_selectedAnimationSettings.copyWith(quality: q));
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
          decoration: BoxDecoration(
            color: isSelected ? theme.textPrimary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? theme.textPrimary : theme.border,
              width: 1,
            ),
          ),
          child: Column(
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? theme.actionText : theme.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 9,
                  color: isSelected ? theme.actionText.withValues(alpha: 0.7) : theme.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSwitchRow(String title, String subtitle, bool value, ValueChanged<bool> onChanged, AuraTheme theme) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.textPrimary)),
              const SizedBox(height: 2),
              Text(subtitle, style: TextStyle(fontSize: 11, color: theme.textSecondary)),
            ],
          ),
        ),
        Switch(
          value: value,
          onChanged: onChanged,
          activeThumbColor: theme.textPrimary,
          activeTrackColor: theme.textPrimary.withValues(alpha: 0.3),
          inactiveThumbColor: theme.textSecondary,
          inactiveTrackColor: theme.border,
        ),
      ],
    );
  }
}
