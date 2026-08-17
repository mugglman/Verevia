import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../page";

describe("Home page (smoke test)", () => {
  it("renders the development environment status", () => {
    render(<Home />);
    expect(screen.getByText("Verevia")).toBeInTheDocument();
    expect(screen.getByText("System operational")).toBeInTheDocument();
  });
});
