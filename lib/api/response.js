
import { NextResponse } from 'next/server';

/**
 * Create a standardized successful API response.
 *
 * @param {unknown} data
 * @param {number} status
 * @returns {NextResponse}
 */
export function apiSuccess(data, status = 200) {
  const httpStatus =
    Number.isInteger(status) && status >= 200 && status < 300
      ? status
      : 200;

  return NextResponse.json(
    {
      success: true,
      data,
    },
    {
      status: httpStatus,
    }
  );
}

/**
 * Create a standardized API error response.
 *
 * @param {string} code
 * @param {string} message
 * @param {number} status
 * @returns {NextResponse}
 */
export function apiError(code, message, status = 500, details = null) {
  const httpStatus =
    Number.isInteger(status) && status >= 400 && status <= 599
      ? status
      : 500;

  const payload = {
    success: false,
    error: {
      code:
        typeof code === 'string' && code.trim()
          ? code
          : 'UNKNOWN_ERROR',

      message:
        typeof message === 'string' && message.trim()
          ? message
          : 'An unexpected error occurred.',
    },
  };

  if (details && typeof details === 'object') {
    Object.assign(payload, details);
  }

  return NextResponse.json(
    payload,
    {
      status: httpStatus,
    }
  );
}
