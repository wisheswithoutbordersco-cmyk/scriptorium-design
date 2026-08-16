import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import {
  advanceCustomerGeneration,
  customerQuickCreateSchema,
  getCustomerGeneration,
  startCustomerGeneration,
} from "./generation";
import { getUserGenerationCount } from "./generationStore";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const jobIdInput = z.object({ jobId: z.string().min(1) }).strict();

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,

  auth: router({
    /**
     * Current signed-in user, mirrored from the Clerk session.
     * Returns `null` for anonymous visitors so the landing screen can render.
     */
    me: publicProcedure.query(opts => opts.ctx.user),
  }),

  generation: router({
    /** Returns how many generations the user has used and their limit. */
    usage: protectedProcedure.query(async ({ ctx }) => {
      const count = await getUserGenerationCount(ctx.user.openId);
      const limit = 5; // FREE_TIER_LIMIT
      const isOwner = process.env.OWNER_OPEN_ID === ctx.user.openId;
      return { used: count, limit, remaining: isOwner ? 999 : Math.max(0, limit - count), unlimited: isOwner };
    }),
    start: protectedProcedure
      .input(customerQuickCreateSchema)
      .mutation(({ ctx, input }) => startCustomerGeneration(input, ctx.user.openId)),
    advance: protectedProcedure
      .input(jobIdInput)
      .mutation(({ ctx, input }) => advanceCustomerGeneration(input.jobId, ctx.user.openId)),
    status: protectedProcedure
      .input(jobIdInput)
      .query(({ ctx, input }) => getCustomerGeneration(input.jobId, ctx.user.openId)),
  }),
});

export type AppRouter = typeof appRouter;
