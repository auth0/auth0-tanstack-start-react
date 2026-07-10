import type { Auth0Instance } from './auth0-server.js'
import type {
  Authenticator,
  MfaChallengeOptions,
  MfaChallengeResponse,
  MfaEnrollOptions,
  MfaEnrollmentResponse,
  MfaVerifyOptions,
  OobChannel,
} from '../types/index.js'

/**
 * Multi-Factor Authentication (step-up) server functions.
 *
 * Thin wrappers over the foundation's `serverClient.mfa.*`. Used in Mode C
 * server functions; the client {@link useMfa} hook delegates to these via RPC.
 *
 * Typical flow: an operation triggers `mfa_required` (caught as
 * `MfaRequiredError`, which carries an `mfaToken`) →
 * {@link mfaGetAuthenticators} → {@link mfaChallenge} → {@link mfaVerify}.
 * If the user has no factors, {@link mfaEnroll} first.
 *
 * Errors: these throw the foundation's `MfaListAuthenticatorsError`,
 * `MfaChallengeError`, `MfaVerifyError`, and `MfaEnrollmentError`
 * respectively, re-exported from this package's `/errors` entry point.
 */

/** Lists the enrolled MFA factors for the user identified by `mfaToken`. */
export async function mfaGetAuthenticators(
  auth0: Auth0Instance,
  options: { mfaToken: string },
): Promise<Authenticator[]> {
  const result = await auth0.client.mfa.listAuthenticators({
    mfaToken: options.mfaToken,
  })
  // Map (not cast) the foundation shape onto our public type.
  return result.map((a) => ({
    id: a.id,
    authenticatorType: a.authenticatorType,
    active: a.active,
    name: a.name,
    oobChannels: a.oobChannels as OobChannel[] | undefined,
  }))
}

/** Initiates an MFA challenge for a given authenticator. */
export async function mfaChallenge(
  auth0: Auth0Instance,
  options: MfaChallengeOptions,
): Promise<MfaChallengeResponse> {
  return auth0.client.mfa.challengeAuthenticator({
    mfaToken: options.mfaToken,
    authenticatorId: options.authenticatorId,
    challengeType: options.challengeType,
  })
}

/**
 * Verifies an MFA challenge response and exchanges it for a new token set.
 *
 * **Side effect:** on success the foundation writes the new tokens into the
 * session. Returns `void`; re-read `context.auth0` (or {@link getSession}) after
 * calling to observe the elevated session.
 */
export async function mfaVerify(
  auth0: Auth0Instance,
  options: MfaVerifyOptions,
): Promise<void> {
  await auth0.client.mfa.verify(options)
}

/** Initiates enrollment of a new MFA factor. */
export async function mfaEnroll(
  auth0: Auth0Instance,
  options: MfaEnrollOptions,
): Promise<MfaEnrollmentResponse> {
  const result = await auth0.client.mfa.enrollAuthenticator(options)
  // Map (not cast) the foundation's OTP/OOB union onto our public type, so a
  // shape change in the foundation surfaces as a type error here.
  if (result.authenticatorType === 'otp') {
    return {
      authenticatorType: 'otp',
      secret: result.secret,
      barcodeUri: result.barcodeUri,
      recoveryCodes: result.recoveryCodes,
      id: result.id,
    }
  }
  return {
    authenticatorType: 'oob',
    oobChannel: result.oobChannel as OobChannel,
    oobCode: result.oobCode,
    barcodeUri: result.barcodeUri,
    recoveryCodes: result.recoveryCodes,
    id: result.id,
  }
}
