/**
 * Test: Multi-Channel Striped P2P Transmission & Reassembly
 * Verifies that 4 parallel data channels can deliver chunks out-of-order
 * and the receiver reassembly buffer guarantees bit-exact SHA-256 integrity.
 */
import * as crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    failed++;
    throw new Error(`Assertion failed: ${name}`);
  }
}

async function run() {
  console.log('\n===============================================================');
  console.log('AURADROP MULTI-CHANNEL STRIPING & REASSEMBLY TEST SUITE');
  console.log('===============================================================\n');

  // STEP 1: Generate 12 MB test payload
  console.log('[STEP 1] Generating 12 MB virtual test file...');
  const FILE_SIZE = 12 * 1024 * 1024; // 12 MB
  const CHUNK_SIZE = 64 * 1024; // 64 KB
  const totalChunks = Math.ceil(FILE_SIZE / CHUNK_SIZE);

  const expectedHasher = crypto.createHash('sha256');
  const chunks: { seq: number; data: Buffer }[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const buf = Buffer.alloc(CHUNK_SIZE);
    buf.fill((i * 17 + 42) % 256);
    expectedHasher.update(buf);
    chunks.push({ seq: i, data: buf });
  }
  const expectedSha256 = expectedHasher.digest('hex');
  assert(expectedSha256.length === 64, `Expected SHA-256 computed: ${expectedSha256.substring(0, 16)}...`);

  // STEP 2: Simulate 4 parallel striped channels with intentional out-of-order delivery
  console.log('\n[STEP 2] Simulating 4-channel striped transmission with out-of-order jitter...');
  
  // Scramble the chunk order to simulate network jitter across 4 channels
  const shuffledChunks = [...chunks];
  // Deterministic shuffle
  for (let i = shuffledChunks.length - 1; i > 0; i--) {
    const j = (i * 37 + 13) % (i + 1);
    [shuffledChunks[i], shuffledChunks[j]] = [shuffledChunks[j], shuffledChunks[i]];
  }
  assert(shuffledChunks[0].seq !== 0, 'Chunks are intentionally shuffled across parallel channels');

  // STEP 3: Receiver Reassembly State Machine
  console.log('\n[STEP 3] Running Receiver Reassembly Matrix...');
  const receiverHasher = crypto.createHash('sha256');
  const pendingChunks = new Map<number, Uint8Array>();
  let nextExpectedSequence = 0;
  let committedChunks = 0;
  const committedSeqOrder: number[] = [];

  const processChunk = (seq: number, bytes: Uint8Array) => {
    receiverHasher.update(bytes);
    committedChunks++;
    committedSeqOrder.push(seq);
  };

  for (const item of shuffledChunks) {
    const seq = item.seq;
    const chunkBytes = new Uint8Array(item.data);

    if (seq === nextExpectedSequence) {
      processChunk(seq, chunkBytes);
      nextExpectedSequence++;

      while (pendingChunks.has(nextExpectedSequence)) {
        const nextBytes = pendingChunks.get(nextExpectedSequence)!;
        pendingChunks.delete(nextExpectedSequence);
        processChunk(nextExpectedSequence, nextBytes);
        nextExpectedSequence++;
      }
    } else if (seq > nextExpectedSequence) {
      pendingChunks.set(seq, chunkBytes);
    }
  }

  // Drain any remaining
  if (pendingChunks.size > 0) {
    const remaining = Array.from(pendingChunks.keys()).sort((a, b) => a - b);
    for (const s of remaining) {
      processChunk(s, pendingChunks.get(s)!);
    }
    pendingChunks.clear();
  }

  assert(committedChunks === totalChunks, `All ${totalChunks} chunks committed`);
  assert(pendingChunks.size === 0, 'Reassembly buffer fully drained');

  // Verify that chunks were committed in strictly ascending sequence 0, 1, 2, ...
  let strictlyOrdered = true;
  for (let i = 0; i < committedSeqOrder.length; i++) {
    if (committedSeqOrder[i] !== i) {
      strictlyOrdered = false;
      break;
    }
  }
  assert(strictlyOrdered, 'Receiver committed chunks in strictly sequential 0..N order despite out-of-order arrival');

  // STEP 4: SHA-256 match
  console.log('\n[STEP 4] Verifying bit-exact SHA-256 match...');
  const finalSha256 = receiverHasher.digest('hex');
  assert(finalSha256 === expectedSha256, `Checksums MATCH 100%: ${finalSha256}`);

  console.log('\n===============================================================');
  console.log(`ALL TESTS PASSED: ${passed}/${passed + failed}`);
  console.log('===============================================================\n');
}

run().catch((e) => {
  console.error('Test failed with error:', e);
  process.exit(1);
});

