import { sessionKey } from "@/lib/demo-auth";
import { googleAppsScriptUrl } from "@/lib/google-api";

export type SecureUserRole =
  | "admin"
  | "trainer";

export type SecureUser = {
  id: string;
  name: string;
  email: string;
  role: SecureUserRole;
  mustChangePassword?: boolean;
};

export type SecureSession = {
  name: string;
  email: string;
  role: SecureUserRole;
  mustChangePassword?: boolean;
  sessionToken: string;
  expiresAt: string;
};

type BaseAuthResponse = {
  ok: boolean;
  success: boolean;
  code?: string;
  message?: string;
};

type SecureLoginResponse =
  BaseAuthResponse & {
    user?: SecureUser;
    sessionToken?: string;
    expiresAt?: string;
    remainingAttempts?: number;
  };

type VerifySessionResponse =
  BaseAuthResponse & {
    user?: {
      id: string;
      name: string;
      email: string;
      role: SecureUserRole;
    };
    expiresAt?: string;
  };

type ChangePasswordResponse =
  BaseAuthResponse & {
    user?: SecureUser;
    sessionToken?: string;
    expiresAt?: string;
  };

export class AuthApiError extends Error {
  code: string;
  remainingAttempts?: number;

  constructor(
    message: string,
    code = "AUTH_ERROR",
    remainingAttempts?: number
  ) {
    super(message);

    this.name = "AuthApiError";
    this.code = code;
    this.remainingAttempts =
      remainingAttempts;
  }
}

async function postAuthentication<T>(
  payload: Record<string, unknown>
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(
      googleAppsScriptUrl,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
  } catch {
    throw new AuthApiError(
      "Unable to connect to the authentication service.",
      "NETWORK_ERROR"
    );
  }

  if (!response.ok) {
    throw new AuthApiError(
      "The authentication service returned an error.",
      "HTTP_ERROR"
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new AuthApiError(
      "The authentication service returned an invalid response.",
      "INVALID_RESPONSE"
    );
  }
}

function responseSucceeded(
  response: BaseAuthResponse
) {
  return response.success ?? response.ok;
}

export async function loginSecurely(
  identifier: string,
  password: string
): Promise<SecureSession> {
  const result =
    await postAuthentication<SecureLoginResponse>({
      action: "secureLogin",
      identifier: identifier.trim(),
      password
    });

  if (
    !responseSucceeded(result) ||
    !result.user ||
    !result.sessionToken ||
    !result.expiresAt
  ) {
    throw new AuthApiError(
      result.message ||
        "Invalid email, username, or password.",
      result.code || "LOGIN_FAILED",
      result.remainingAttempts
    );
  }

  const session: SecureSession = {
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    mustChangePassword:
      result.user.mustChangePassword,
    sessionToken:
      result.sessionToken,
    expiresAt: result.expiresAt
  };

  saveSecureSession(session);

  return session;
}

export async function verifySecureSession(
  session: SecureSession
): Promise<SecureSession> {
  if (
    !session.sessionToken ||
    isSessionExpired(session)
  ) {
    clearSecureSession();

    throw new AuthApiError(
      "Your session has expired. Please sign in again.",
      "AUTH_REQUIRED"
    );
  }

  const result =
    await postAuthentication<VerifySessionResponse>({
      action: "verifySession",
      sessionToken:
        session.sessionToken
    });

  if (
    !responseSucceeded(result) ||
    !result.user ||
    !result.expiresAt
  ) {
    clearSecureSession();

    throw new AuthApiError(
      result.message ||
        "Your session has expired. Please sign in again.",
      result.code ||
        "AUTH_REQUIRED"
    );
  }

  const verifiedSession: SecureSession = {
    ...session,
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    expiresAt: result.expiresAt
  };

  saveSecureSession(
    verifiedSession
  );

  return verifiedSession;
}

export async function changePasswordSecurely(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<SecureSession> {
  const existingSession =
    getSecureSession();

  if (!existingSession) {
    throw new AuthApiError(
      "Your session has expired. Please sign in again.",
      "AUTH_REQUIRED"
    );
  }

  if (
    isSessionExpired(
      existingSession
    )
  ) {
    clearSecureSession();

    throw new AuthApiError(
      "Your session has expired. Please sign in again.",
      "AUTH_REQUIRED"
    );
  }

  const result =
    await postAuthentication<ChangePasswordResponse>({
      action:
        "secureChangePassword",
      sessionToken:
        existingSession.sessionToken,
      currentPassword,
      newPassword,
      confirmPassword
    });

  if (
    !responseSucceeded(result) ||
    !result.user ||
    !result.sessionToken ||
    !result.expiresAt
  ) {
    if (
      result.code ===
      "AUTH_REQUIRED"
    ) {
      clearSecureSession();
    }

    throw new AuthApiError(
      result.message ||
        "Unable to change your password.",
      result.code ||
        "PASSWORD_CHANGE_FAILED"
    );
  }

  const updatedSession: SecureSession = {
    name: result.user.name,
    email: result.user.email,
    role: result.user.role,
    mustChangePassword: false,
    sessionToken:
      result.sessionToken,
    expiresAt: result.expiresAt
  };

  saveSecureSession(
    updatedSession
  );

  return updatedSession;
}

export async function logoutSecurely() {
  const session =
    getSecureSession();

  clearSecureSession();

  if (!session?.sessionToken) {
    return;
  }

  try {
    await postAuthentication<BaseAuthResponse>({
      action: "secureLogout",
      sessionToken:
        session.sessionToken
    });
  } catch {
    // Local logout remains successful.
  }
}

export function saveSecureSession(
  session: SecureSession
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  localStorage.setItem(
    sessionKey,
    JSON.stringify(session)
  );
}

export function getSecureSession():
  | SecureSession
  | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  const storedSession =
    localStorage.getItem(
      sessionKey
    );

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession =
      JSON.parse(
        storedSession
      ) as Partial<SecureSession>;

    if (
      !parsedSession.name ||
      !parsedSession.email ||
      !parsedSession.role ||
      !parsedSession.sessionToken ||
      !parsedSession.expiresAt
    ) {
      clearSecureSession();
      return null;
    }

    const session: SecureSession = {
      name: parsedSession.name,
      email: parsedSession.email,
      role: parsedSession.role,
      mustChangePassword:
        parsedSession.mustChangePassword,
      sessionToken:
        parsedSession.sessionToken,
      expiresAt:
        parsedSession.expiresAt
    };

    if (
      isSessionExpired(session)
    ) {
      clearSecureSession();
      return null;
    }

    return session;
  } catch {
    clearSecureSession();
    return null;
  }
}

export function clearSecureSession() {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  localStorage.removeItem(
    sessionKey
  );
}

export function isSessionExpired(
  session: Pick<
    SecureSession,
    "expiresAt"
  >
) {
  const expiration =
    new Date(
      session.expiresAt
    ).getTime();

  if (
    !Number.isFinite(expiration)
  ) {
    return true;
  }

  return expiration <= Date.now();
}

export function getSessionToken() {
  return (
    getSecureSession()
      ?.sessionToken || ""
  );
}

export function getSessionRemainingTime() {
  const session =
    getSecureSession();

  if (!session) return 0;

  const expiration =
    new Date(
      session.expiresAt
    ).getTime();

  return Math.max(
    0,
    expiration - Date.now()
  );
}
