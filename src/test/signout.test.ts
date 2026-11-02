import { describe, expect, it } from "vitest";
import { getState, login, logout } from "@/lib/store";

describe("sign-out for every dashboard role", () => {
  for (const email of ["patient@demo.com", "doctor@demo.com", "admin@demo.com"]) {
    it(`clears the signed-in identity for ${email}`, async () => {
      const user = await login(email, "demo123");
      expect(getState().sessionUserId).toBe(user.id);
      await logout();
      expect(getState().sessionUserId).toBeNull();
    });
  }
});