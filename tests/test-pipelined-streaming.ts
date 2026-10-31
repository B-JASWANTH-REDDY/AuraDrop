/**
 * Benchmark & Verification: Pipelined Sliding Window Prefetching vs Stop-and-Wait
 * Reverse-engineered from high-performance open-source streaming architectures.
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
  console.log('AURADROP PIPELINED SLIDING WINDOW PERFORMANCE TEST');
  console.log('===============================================================\n');

  const TOTAL_SIZE = 8 * 1024 * 1024; // 8 MB
  const CHUNK_SIZE = 64 * 1024; // 64 KB
  const totalChunks = Math.ceil(TOTAL_SIZE / CHUNK_SIZE);

  // Generate file data
  const rawBuffers: Buffer[] = [];
  const hasher = crypto.createHash('sha256');
  for (let i = 0; i < totalChunks; i++) {
    const b = Buffer.alloc(CHUNK_SIZE);
    b.fill(i % 256);
    hasher.update(b);
    rawBuffers.push(b);
  }
  const expectedSha256 = hasher.digest('hex');

  // Simulated asynchronous disk slice read (with realistic 1ms I/O latency)
  const mockReadSlice = async (index: number): Promise<Buffer> => {
    await new Promise((r) => setTimeout(r, 1)); // simulated disk I/O latency
    return rawBuffers[index];
  };

  // Simulated network channel transmission (with 1ms transmission latency)
  const mockNetworkSend = async (bytes: Buffer): Promise<void> => {
    await new Promise((r) => setTimeout(r, 1)); // simulated NIC network transmission
  };

  // TEST 1: Synchronous Stop-and-Wait
  console.log('[TEST 1] Benchmarking Synchronous Stop-and-Wait (Old Way)...');
  const t0 = performance.now();
  for (let i = 0; i < totalChunks; i++) {
    const chunk = await mockReadSlice(i); // Wait for disk
    await mockNetworkSend(chunk); // Then wait for network
  }
  const stopAndWaitDuration = performance.now() - t0;
  const stopAndWaitSpeed = (TOTAL_SIZE / (1024 * 1024)) / (stopAndWaitDuration / 1000);
  console.log(`  -> Stop-and-Wait Duration: ${stopAndWaitDuration.toFixed(1)} ms (${stopAndWaitSpeed.toFixed(1)} MB/s)`);

  // TEST 2: Pipelined Sliding Window (New Way)
  console.log('\n[TEST 2] Benchmarking Pipelined Sliding Window Prefetcher (Pipeline Depth = 4)...');
  const t1 = performance.now();
  const PIPELINE_DEPTH = 4;
  const receiverHasher = crypto.createHash('sha256');

  interface PipeItem {
    index: number;
    promise: Promise<Buffer>;
  }

  const pipeline: PipeItem[] = [];
  let nextScheduleIdx = 0;

  // Prime pipeline
  while (nextScheduleIdx < totalChunks && pipeline.length < PIPELINE_DEPTH) {
    pipeline.push({ index: nextScheduleIdx, promise: mockReadSlice(nextScheduleIdx) });
    nextScheduleIdx++;
  }

  let receivedChunks = 0;
  while (pipeline.length > 0) {
    const current = pipeline.shift()!;
    const chunk = await current.promise; // Disk read was running concurrently with previous send!

    if (nextScheduleIdx < totalChunks) {
      pipeline.push({ index: nextScheduleIdx, promise: mockReadSlice(nextScheduleIdx) });
      nextScheduleIdx++;
    }

    await mockNetworkSend(chunk);
    receiverHasher.update(chunk);
    receivedChunks++;
  }

  const pipelinedDuration = performance.now() - t1;
  const pipelinedSpeed = (TOTAL_SIZE / (1024 * 1024)) / (pipelinedDuration / 1000);
  console.log(`  -> Pipelined Duration: ${pipelinedDuration.toFixed(1)} ms (${pipelinedSpeed.toFixed(1)} MB/s)`);

  // Assertions
  assert(receivedChunks === totalChunks, `All ${totalChunks} chunks processed`);
  const finalSha256 = receiverHasher.digest('hex');
  assert(finalSha256 === expectedSha256, `Pipelined SHA-256 match confirmed: ${finalSha256.substring(0, 16)}...`);
  assert(pipelinedDuration < stopAndWaitDuration, `Pipelining is faster (${pipelinedSpeed.toFixed(1)} MB/s vs ${stopAndWaitSpeed.toFixed(1)} MB/s)`);

  console.log('\n===============================================================');
  console.log(`SPEEDUP RATIO: ${(stopAndWaitDuration / pipelinedDuration).toFixed(2)}x faster throughput`);
  console.log(`TEST PASSED: ${passed}/${passed + failed}`);
  console.log('===============================================================\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

