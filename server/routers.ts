import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { advanceCustomerGeneration, customerQuickCreateSchema, getCustomerGeneration, startCustomerGeneration } from "./generation";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  generation: router({
    start: publicProcedure.input(customerQuickCreateSchema).mutation(({ input }) =>
      startCustomerGeneration(input)
    ),
    advance: publicProcedure.input(z.object({ jobId: z.string().min(1) }).strict()).mutation(({ input }) =>
      advanceCustomerGeneration(input.jobId)
    ),
    status: publicProcedure.input(z.object({ jobId: z.string().min(1) }).strict()).query(({ input }) =>
      getCustomerGeneration(input.jobId)
    ),
  }),
});

export type AppRouter = typeof appRouter;
