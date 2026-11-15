import assert from "node:assert/strict";
import test from "node:test";
import { mapGoogleError } from "./errors.js";

test("expired or revoked refresh token asks to reconnect", () => {
  assert.equal(mapGoogleError({ response: { status: 400, data: { error: "invalid_grant" } } }).code, "STORAGE_AUTH_EXPIRED");
  assert.equal(mapGoogleError({ message: "Token has been expired or revoked." }).code, "STORAGE_AUTH_EXPIRED");
  assert.equal(mapGoogleError({ response: { status: 401, data: {} } }).code, "STORAGE_AUTH_EXPIRED");
});

test("wrong OAuth client is a configuration error", () => {
  assert.equal(mapGoogleError({ response: { status: 401, data: { error: "invalid_client" } } }).code, "STORAGE_CONFIG_ERROR");
});

test("quota, rate limit, permission, missing file and network are told apart", () => {
  assert.equal(mapGoogleError({ code: 403, errors: [{ reason: "storageQuotaExceeded" }] }).code, "STORAGE_QUOTA");
  assert.equal(mapGoogleError({ code: 403, errors: [{ reason: "userRateLimitExceeded" }] }).code, "STORAGE_RATE_LIMIT");
  assert.equal(mapGoogleError({ response: { status: 429, data: {} } }).code, "STORAGE_RATE_LIMIT");
  assert.equal(mapGoogleError({ code: 403, errors: [{ reason: "insufficientPermissions" }] }).code, "STORAGE_PERMISSION");
  assert.equal(mapGoogleError({ response: { status: 404, data: {} } }).code, "STORAGE_FILE_MISSING");
  assert.equal(mapGoogleError({ code: "ENOTFOUND" }).code, "STORAGE_NETWORK");
  assert.equal(mapGoogleError(new Error("boom")).code, "STORAGE_ERROR");
});

test("messages never echo provider payloads", () => {
  const mapped = mapGoogleError({ response: { status: 400, data: { error: "invalid_grant", error_description: "secret-token-xyz" } } });
  assert.equal(mapped.message.includes("secret-token-xyz"), false);
});
