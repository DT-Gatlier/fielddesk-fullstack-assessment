import { prisma } from "./prisma";
import { workerConfig } from "./config";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function processJob(jobId: string) {
  console.log(`[worker] Processing job ${jobId}`);

  try {
    // --------------------------------------------------
    // Claim the job
    // --------------------------------------------------

    const claimed = await prisma.notificationJob.updateMany({
      where: {
        id: jobId,
        status: "PENDING",
      },
      data: {
        status: "PROCESSING",
        attempts: {
          increment: 1,
        },
      },
    });

    // Another worker may have claimed it.
    if (claimed.count === 0) {
      return;
    }

    const job = await prisma.notificationJob.findUnique({
      where: {
        id: jobId,
      },
      include: {
        technician: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        workOrder: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
          },
        },
      },
    });

    if (!job) {
      return;
    }

    // --------------------------------------------------
    // Simulate notification delivery
    // --------------------------------------------------

    console.log(
      `[worker] Sending notification to ${job.technician.email}`,
    );

    console.log(
      `[worker] Work order: ${job.workOrder.referenceNumber}`,
    );

    // We'll replace this with the actual notification
    // provider later.
    await sleep(500);

    // --------------------------------------------------
    // Record successful attempt
    // --------------------------------------------------

    await prisma.notificationAttempt.create({
      data: {
        notificationJobId: job.id,
        attemptNumber: job.attempts,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // --------------------------------------------------
    // Mark job completed
    // --------------------------------------------------

    await prisma.notificationJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "COMPLETED",
        lastError: null,
      },
    });

    console.log(`[worker] Job ${job.id} completed`);
  } catch (error) {
    console.error(`[worker] Job ${jobId} failed`, error);

    await handleJobFailure(jobId, error);
  }
}

async function handleJobFailure(
  jobId: string,
  error: unknown,
) {
  const job = await prisma.notificationJob.findUnique({
    where: {
      id: jobId,
    },
  });

  if (!job) {
    return;
  }

  const errorMessage =
    error instanceof Error
      ? error.message
      : "Unknown notification error";

  await prisma.notificationAttempt.create({
    data: {
      notificationJobId: job.id,
      attemptNumber: job.attempts,
      status: "FAILED",
      error: errorMessage,
      completedAt: new Date(),
    },
  });

  if (job.attempts >= workerConfig.maxAttempts) {
    await prisma.notificationJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "FAILED",
        lastError: errorMessage,
      },
    });

    console.log(
      `[worker] Job ${job.id} permanently failed`,
    );

    return;
  }

  // Exponential backoff:
  //
  // attempt 1 -> 2 seconds
  // attempt 2 -> 4 seconds
  // attempt 3 -> 8 seconds
  //

  const delay =
    Math.pow(2, job.attempts) * 1000;

  await prisma.notificationJob.update({
    where: {
      id: job.id,
    },
    data: {
      status: "PENDING",
      availableAt: new Date(Date.now() + delay),
      lastError: errorMessage,
    },
  });

  console.log(
    `[worker] Job ${job.id} scheduled for retry`,
  );
}

async function pollJobs() {
  const jobs = await prisma.notificationJob.findMany({
    where: {
      status: "PENDING",
      availableAt: {
        lte: new Date(),
      },
    },

    orderBy: {
      availableAt: "asc",
    },

    take: workerConfig.batchSize,

    select: {
      id: true,
    },
  });

  for (const job of jobs) {
    await processJob(job.id);
  }
}

async function main() {
  console.log("Notification worker started");

  while (true) {
    try {
      await pollJobs();
    } catch (error) {
      console.error(
        "[worker] Polling error:",
        error,
      );
    }

    await sleep(workerConfig.pollIntervalMs);
  }
}

main().catch(async (error) => {
  console.error(error);

  await prisma.$disconnect();

  process.exit(1);
});