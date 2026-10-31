import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/models.dart';
import '../theme/aura_theme.dart';
import 'notification_host.dart';

/// Always-Active Floating Dynamic Island for AuraDrop Mobile (Android)
/// Mimics Apple AirDrop & Dynamic Island on iOS, styled with AuraDrop obsidian-black aesthetics.
/// Provides live discovery, nearby members list, one-tap real file sharing,
/// real-time transfer progress, and incoming chat notifications.
class AuraMobileIsland extends StatefulWidget {
  final List<PeerDevice> peers;
  final TransferState transferState;
  final String activeFileName;
  final int transferredBytes;
  final int totalTransferBytes;
  final int speedBytesPerSec;
  final int etaSeconds;
  final bool isSender;
  final Future<void> Function(PeerDevice peer) onSendFilesToPeer;
  final VoidCallback onCancelTransfer;
  final void Function(PeerDevice peer) onOpenChatWithPeer;
  final VoidCallback? onRescan;

  const AuraMobileIsland({
    super.key,
    required this.peers,
    required this.transferState,
    required this.activeFileName,
    required this.transferredBytes,
    required this.totalTransferBytes,
    required this.speedBytesPerSec,
    required this.etaSeconds,
    required this.isSender,
    required this.onSendFilesToPeer,
    required this.onCancelTransfer,
    required this.onOpenChatWithPeer,
    this.onRescan,
  });

  @override
  State<AuraMobileIsland> createState() => _AuraMobileIslandState();
}

class _AuraMobileIslandState extends State<AuraMobileIsland>
    with SingleTickerProviderStateMixin {
  bool _isManuallyExpanded = false;
  late final AnimationController _pulseController;
  final _notificationController = InAppNotificationController();
  String? _lastNotificationId;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _notificationController.addListener(_onNotificationUpdate);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _notificationController.removeListener(_onNotificationUpdate);
    super.dispose();
  }

  void _onNotificationUpdate() {
    final current = _notificationController.current;
    if (current != null && current.id != _lastNotificationId) {
      _lastNotificationId = current.id;
      // Automatically expand when an active alert (request or chat) arrives
      setState(() {
        _isManuallyExpanded = true;
      });
    }
    if (mounted) setState(() {});
  }

  bool get _isTransferActive {
    return widget.transferState == TransferState.transferring ||
        widget.transferState == TransferState.waitingForAccept ||
        widget.transferState == TransferState.verifying ||
        widget.transferState == TransferState.flushing;
  }

  bool get _isExpanded {
    // If user manually expanded, or if there is an incoming request / active transfer
    if (_isManuallyExpanded) return true;
    final currentNotif = _notificationController.current;
    if (currentNotif != null &&
        currentNotif.type == InAppNotificationType.transferRequest) {
      return true;
    }
    return false;
  }

  String _formatBytes(int bytes) {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  String _formatSpeed(int bps) {
    if (bps <= 0) return '0 B/s';
    if (bps < 1024) return '$bps B/s';
    if (bps < 1024 * 1024) return '${(bps / 1024).toStringAsFixed(1)} KB/s';
    return '${(bps / (1024 * 1024)).toStringAsFixed(1)} MB/s';
  }

  IconData _getPlatformIcon(String platform) {
    final lower = platform.toLowerCase();
    if (lower.contains('win')) return Icons.laptop_windows_rounded;
    if (lower.contains('android')) return Icons.phone_android_rounded;
    if (lower.contains('mac') || lower.contains('ios') || lower.contains('apple')) {
      return Icons.apple_rounded;
    }
    if (lower.contains('linux')) return Icons.terminal_rounded;
    return Icons.devices_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final theme = AuraTheme.of(context);
    final currentNotif = _notificationController.current;

    final screenWidth = MediaQuery.of(context).size.width;
    final expandedWidth = math.min(420.0, screenWidth - 24.0);

    return Material(
      color: Colors.transparent,
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          setState(() {
            _isManuallyExpanded = !_isManuallyExpanded;
          });
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
          width: _isExpanded ? expandedWidth : 200.0,
          margin: EdgeInsets.symmetric(horizontal: _isExpanded ? 12 : 0),
          padding: _isExpanded
              ? const EdgeInsets.symmetric(horizontal: 16, vertical: 14)
              : const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: const Color(0xFF0C0C0E),
            borderRadius: BorderRadius.circular(_isExpanded ? 24 : 20),
            border: Border.all(
              color: _isTransferActive
                  ? const Color(0xFF007AFF).withValues(alpha: 0.8)
                  : (currentNotif?.type == InAppNotificationType.transferRequest
                      ? const Color(0xFF007AFF)
                      : Colors.white.withValues(alpha: 0.16)),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: _isExpanded ? 0.75 : 0.45),
                blurRadius: _isExpanded ? 28 : 14,
                offset: Offset(0, _isExpanded ? 8 : 4),
              ),
            ],
          ),
          child: _isExpanded
              ? _buildExpandedContent(theme, currentNotif)
              : _buildCollapsedPill(theme, currentNotif),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // COLLAPSED PILL (Always-Active Top Center)
  // ---------------------------------------------------------------------------
  Widget _buildCollapsedPill(AuraTheme theme, InAppNotificationItem? notif) {
    if (_isTransferActive) {
      final double progress = widget.totalTransferBytes > 0
          ? (widget.transferredBytes / widget.totalTransferBytes).clamp(0.0, 1.0)
          : 0.0;
      final pct = (progress * 100).toInt();

      return Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 15,
            height: 15,
            child: CircularProgressIndicator(
              value: progress > 0 ? progress : null,
              strokeWidth: 2.2,
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF007AFF)),
              backgroundColor: const Color(0xFF2C2C2E),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              '${widget.isSender ? '⬆' : '⬇'} $pct% · ${_formatSpeed(widget.speedBytesPerSec)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ],
      );
    }

    if (notif != null) {
      final isRequest = notif.type == InAppNotificationType.transferRequest;
      return Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isRequest ? const Color(0xFF007AFF) : const Color(0xFF38BDF8),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              isRequest ? 'AirDrop: ${notif.title}' : notif.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
        ],
      );
    }

    // Idle or Discovering State
    final hasPeers = widget.peers.isNotEmpty;
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(5),
          child: Image.asset(
            'assets/logo.png',
            width: 16,
            height: 16,
            fit: BoxFit.contain,
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            hasPeers
                ? (widget.peers.length == 1
                    ? widget.peers.first.name
                    : '${widget.peers.length} Nearby')
                : 'AuraDrop • Ready',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFFF3F4F6),
              letterSpacing: -0.2,
            ),
          ),
        ),
        const SizedBox(width: 8),
        FadeTransition(
          opacity: CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
          child: Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: hasPeers ? const Color(0xFF38BDF8) : const Color(0xFF4ADE80),
            ),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // EXPANDED CARD (Nearby Members, Live Progress, or Transfer Request)
  // ---------------------------------------------------------------------------
  Widget _buildExpandedContent(AuraTheme theme, InAppNotificationItem? notif) {
    if (notif != null && notif.type == InAppNotificationType.transferRequest) {
      return _buildTransferRequestCard(notif);
    }

    if (_isTransferActive) {
      return _buildTransferProgressCard();
    }

    if (notif != null && notif.type == InAppNotificationType.chatMessage) {
      return _buildChatMessageCard(notif);
    }

    return _buildNearbyMembersCard();
  }

  // ---------------------------------------------------------------------------
  // 1. NEARBY MEMBERS CARD (With direct Share and Chat actions)
  // ---------------------------------------------------------------------------
  Widget _buildNearbyMembersCard() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Top Header Row
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.asset(
                    'assets/logo.png',
                    width: 24,
                    height: 24,
                    fit: BoxFit.contain,
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'AuraDrop Nearby',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      '${widget.peers.length} active device${widget.peers.length == 1 ? '' : 's'} on Wi-Fi',
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF8E8E93),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            Row(
              children: [
                if (widget.onRescan != null)
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, size: 19, color: Color(0xFF38BDF8)),
                    tooltip: 'Rescan Network',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      widget.onRescan?.call();
                    },
                  ),
                const SizedBox(width: 12),
                IconButton(
                  icon: const Icon(Icons.keyboard_arrow_up_rounded, size: 20, color: Color(0xFF8E8E93)),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () {
                    HapticFeedback.selectionClick();
                    setState(() => _isManuallyExpanded = false);
                  },
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Discovered Nearby Members List
        if (widget.peers.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Column(
              children: [
                FadeTransition(
                  opacity: CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFFA78BFA),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Searching local network...',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                ),
                const SizedBox(height: 3),
                const Text(
                  'Make sure devices are on the same Wi-Fi or hotspot',
                  style: TextStyle(fontSize: 11, color: Color(0xFF8E8E93)),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          )
        else
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 220),
            child: ListView.separated(
              shrinkWrap: true,
              physics: const BouncingScrollPhysics(),
              itemCount: widget.peers.length,
              separatorBuilder: (ctx, idx) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final peer = widget.peers[index];
                final platformIcon = _getPlatformIcon(peer.platform);

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Row(
                    children: [
                      // OS Avatar Icon
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: const Color(0xFF242426),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                        ),
                        child: Icon(
                          platformIcon,
                          size: 19,
                          color: const Color(0xFF38BDF8),
                        ),
                      ),
                      const SizedBox(width: 10),

                      // Name & IP
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              peer.name.isNotEmpty ? peer.name : 'Nearby Peer',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              peer.ip.isNotEmpty ? '${peer.ip} • Ready' : 'Direct LAN',
                              style: const TextStyle(
                                fontSize: 11,
                                color: Color(0xFF8E8E93),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Action Button 1: Share Files
                      ElevatedButton.icon(
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          widget.onSendFilesToPeer(peer);
                        },
                        icon: const Icon(Icons.upload_file_rounded, size: 14),
                        label: const Text('Share', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF007AFF),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                      ),
                      const SizedBox(width: 6),

                      // Action Button 2: Chat
                      InkWell(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          widget.onOpenChatWithPeer(peer);
                        },
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                          ),
                          child: const Icon(Icons.chat_bubble_outline_rounded, size: 15, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // 2. INCOMING TRANSFER REQUEST CARD (Accept / Decline)
  // ---------------------------------------------------------------------------
  Widget _buildTransferRequestCard(InAppNotificationItem item) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFF007AFF),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.arrow_downward_rounded, size: 20, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'AirDrop Share Request',
                    style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: Color(0xFFD1D1D6)),
                  ),
                  if (item.subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.subtitle!,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF38BDF8)),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 38,
                child: ElevatedButton(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    _notificationController.dismissCurrent();
                    item.onDecline?.call();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2C2C2E),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(19)),
                  ),
                  child: const Text('Decline', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: SizedBox(
                height: 38,
                child: ElevatedButton(
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    _notificationController.dismissCurrent();
                    item.onAccept?.call();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF007AFF),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(19)),
                  ),
                  child: const Text('Accept', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // 3. LIVE TRANSFER PROGRESS CARD
  // ---------------------------------------------------------------------------
  Widget _buildTransferProgressCard() {
    final double progress = widget.totalTransferBytes > 0
        ? (widget.transferredBytes / widget.totalTransferBytes).clamp(0.0, 1.0)
        : 0.0;
    final pct = (progress * 100).toInt();

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: const Color(0xFF242426),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    widget.isSender ? Icons.upload_rounded : Icons.download_rounded,
                    size: 18,
                    color: const Color(0xFF007AFF),
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.isSender ? 'AirDrop Sending...' : 'AirDrop Receiving...',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white),
                    ),
                    Text(
                      widget.activeFileName.isNotEmpty ? widget.activeFileName : 'Transferring file',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, color: Color(0xFF8E8E93)),
                    ),
                  ],
                ),
              ],
            ),
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18, color: Color(0xFF8E8E93)),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: () {
                HapticFeedback.selectionClick();
                widget.onCancelTransfer();
              },
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Progress bar
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: progress > 0 ? progress : null,
            minHeight: 6,
            backgroundColor: const Color(0xFF2C2C2E),
            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF007AFF)),
          ),
        ),
        const SizedBox(height: 8),

        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${_formatBytes(widget.transferredBytes)} / ${_formatBytes(widget.totalTransferBytes)} • $pct%',
              style: const TextStyle(fontSize: 11, color: Color(0xFF8E8E93)),
            ),
            Text(
              '⚡ ${_formatSpeed(widget.speedBytesPerSec)}',
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Colors.white),
            ),
          ],
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // 4. INCOMING CHAT MESSAGE CARD
  // ---------------------------------------------------------------------------
  Widget _buildChatMessageCard(InAppNotificationItem notif) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: const Color(0xFF242426),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.chat_bubble_outline_rounded, size: 17, color: Color(0xFF38BDF8)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    notif.title,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    notif.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: Color(0xFFD1D1D6)),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    _notificationController.dismissCurrent();
                    setState(() => _isManuallyExpanded = false);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2C2C2E),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                  ),
                  child: const Text('Dismiss', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    _notificationController.dismissCurrent();
                    setState(() => _isManuallyExpanded = false);
                    notif.onTap?.call();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF007AFF),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                  ),
                  child: const Text('Open Chat', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

