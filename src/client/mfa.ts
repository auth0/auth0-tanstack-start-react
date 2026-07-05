import { useCallback, useMemo } from 'react'
import type {
  Authenticator,
  MfaChallengeResponse,
  MfaEnrollOptions,
  MfaEnrollmentResponse,
  MfaVerifyOptions,
} from '../types/index.js'

/**
 * The set of MFA server-function callables the app wires up with its own
 * `auth0` instance and passes to {@link useMfa}.
 *
 * Why injection: the MFA operations run server-side against the app's `auth0`
 * instance (which lives in the app's `auth.server.ts`, not the SDK). The app
 * creates thin `createServerFn()` wrappers around the SDK's `/server` MFA
 * functions and passes them here, so the client bundle never imports server
 * code while still calling the real server logic over RPC.
 *
 * @example
 * ```ts
 * // app: src/mfa.server.ts
 * export const getAuthenticatorsFn = createServerFn()
 *   .inputValidator((d: { mfaToken: string }) => d)
 *   .handler(({ data }) => mfaGetAuthenticators(auth0, data))
 * // ...challengeFn, verifyFn, enrollFn similarly
 * ```
 */
export interface MfaServerFns {
  getAuthenticators: (input: { mfaToken: string }) => Promise<Authenticator[]>
  challenge: (input: {
    mfaToken: string
    authenticatorId?: string
    challengeType: 'otp' | 'oob'
  }) => Promise<MfaChallengeResponse>
  verify: (input: MfaVerifyOptions) => Promise<void>
  enroll: (input: MfaEnrollOptions) => Promise<MfaEnrollmentResponse>
}

/** Helpers returned by {@link useMfa}. */
export interface UseMfaResult {
  getAuthenticators: (mfaToken: string) => Promise<Authenticator[]>
  challenge: (
    authenticatorId: string | undefined,
    options: { mfaToken: string; challengeType: 'otp' | 'oob' },
  ) => Promise<MfaChallengeResponse>
  verify: (options: MfaVerifyOptions) => Promise<void>
  enroll: (options: MfaEnrollOptions) => Promise<MfaEnrollmentResponse>
}

/**
 * MFA step-up helpers for client components. Pass the MFA server functions the
 * app created with its `auth0` instance (see {@link MfaServerFns}). Returns
 * ergonomic, fully-typed wrappers around them.
 */
export function useMfa(serverFns: MfaServerFns): UseMfaResult {
  const getAuthenticators = useCallback(
    (mfaToken: string) => serverFns.getAuthenticators({ mfaToken }),
    [serverFns],
  )
  const challenge = useCallback(
    (
      authenticatorId: string | undefined,
      options: { mfaToken: string; challengeType: 'otp' | 'oob' },
    ) =>
      serverFns.challenge({
        authenticatorId,
        mfaToken: options.mfaToken,
        challengeType: options.challengeType,
      }),
    [serverFns],
  )
  const verify = useCallback(
    (options: MfaVerifyOptions) => serverFns.verify(options),
    [serverFns],
  )
  const enroll = useCallback(
    (options: MfaEnrollOptions) => serverFns.enroll(options),
    [serverFns],
  )
  return useMemo(
    () => ({ getAuthenticators, challenge, verify, enroll }),
    [getAuthenticators, challenge, verify, enroll],
  )
}
