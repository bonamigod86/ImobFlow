import { describe, expect, it } from "vitest";
import {
  signRequest,
  canonicalQuery,
  awsUriEncode,
} from "@/lib/email/ses-signer";

/**
 * SigV4 locked against the AWS IAM documentation example ("Create a signed
 * AWS API request", ListUsers GET). The canonical-request hash
 * `f536975d...` matches the value chain printed in the AWS docs; the final
 * signature was machine-verified against the mhart/aws4 reference
 * implementation (v1.13.2) — identical output. If this test breaks, the
 * signer diverged from the spec — fix the signer, never the fixture.
 */
describe("AWS Signature V4 signer", () => {
  it("reproduces the AWS docs GET example exactly", () => {
    const { authorization, headers } = signRequest({
      method: "GET",
      host: "iam.amazonaws.com",
      path: "/",
      query: "Action=ListUsers&Version=2010-05-08",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: "",
      region: "us-east-1",
      service: "iam",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      now: new Date("2015-08-30T12:36:00.000Z"),
    });

    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, " +
        "SignedHeaders=content-type;host;x-amz-date, " +
        "Signature=33f5dad2191de0cb4b7ab912f876876c2c4f72e2991a458f9499233c7b992438",
    );
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded; charset=utf-8");
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
  });

  it("produces 12-digit amz-date + 8-digit scope date from the clock", () => {
    const fixed = new Date("2026-08-19T02:03:04.000Z");
    const { headers } = signRequest({
      method: "POST",
      host: "email.us-east-1.amazonaws.com",
      path: "/",
      body: "Action=SendEmail",
      region: "us-east-1",
      service: "ses",
      accessKeyId: "A",
      secretAccessKey: "S",
      now: fixed,
      contentSha256Header: true,
    });
    expect(headers["x-amz-date"]).toBe("20260819T020304Z");
    expect(headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(headers).sort()).toEqual([
      "authorization",
      "host",
      "x-amz-content-sha256",
      "x-amz-date",
    ]);
  });

  it("changes the signature when the body changes (tamper detection)", () => {
    const base = {
      method: "POST",
      host: "email.sa-east-1.amazonaws.com",
      path: "/",
      region: "sa-east-1",
      service: "ses",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      now: new Date("2026-08-19T00:00:00.000Z"),
      contentSha256Header: true,
    };
    const a = signRequest({ ...base, body: "A" });
    expect(signRequest({ ...base, body: "B" }).authorization).not.toBe(
      a.authorization,
    );
  });

  it("is deterministic for identical inputs", () => {
    const a = signRequest({ method: "GET", host: "h", path: "/", body: "x", region: "us-east-1", service: "ses", accessKeyId: "a", secretAccessKey: "s", now: new Date("2026-01-01T00:00:00Z") });
    const b = signRequest({ method: "GET", host: "h", path: "/", body: "x", region: "us-east-1", service: "ses", accessKeyId: "a", secretAccessKey: "s", now: new Date("2026-01-01T00:00:00Z") });
    expect(a.authorization).toBe(b.authorization);
  });

  it("encodes query strings in AWS canonical form", () => {
    expect(canonicalQuery({ b: "2", a: "1 *" })).toBe("a=1%20%2A&b=2");
    expect(awsUriEncode("a~b!c'd(e)f*g")).toBe("a~b%21c%27d%28e%29f%2Ag");
  });
});