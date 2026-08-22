import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

import { InvitationAcceptForm } from "../invitation-accept-form";

describe("InvitationAcceptForm", () => {
  it("shows a name field and signup wording when no account exists yet", () => {
    render(<InvitationAcceptForm token="tok" email="anna@example.invalid" accountExists={false} />);
    expect(screen.getByLabelText("Dein Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Passwort festlegen")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Konto erstellen und Einladung annehmen" }),
    ).toBeInTheDocument();
  });

  it("hides the name field and shows login wording when an account already exists", () => {
    render(<InvitationAcceptForm token="tok" email="anna@example.invalid" accountExists={true} />);
    expect(screen.queryByLabelText("Dein Name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Passwort")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Anmelden und Einladung annehmen" }),
    ).toBeInTheDocument();
  });

  it("shows the invitation email as read-only", () => {
    render(<InvitationAcceptForm token="tok" email="anna@example.invalid" accountExists={false} />);
    const emailInput = screen.getByLabelText("E-Mail") as HTMLInputElement;
    expect(emailInput.value).toBe("anna@example.invalid");
    expect(emailInput).toHaveAttribute("readonly");
  });
});
