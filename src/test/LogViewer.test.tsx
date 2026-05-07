import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogViewer } from "../components/LogViewer";

describe("LogViewer", () => {
  it("shows installation and PhiSpy log tab labels", () => {
    render(<LogViewer stdout={["install"]} stderr={["phispy"]} />);

    expect(screen.getByRole("button", { name: "Installation Log (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PhiSpy Log (1)" })).toBeInTheDocument();
  });

  it("switches between installation and PhiSpy log output", () => {
    render(<LogViewer stdout={["install line"]} stderr={["phispy line"]} />);

    expect(screen.getByText("install line")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PhiSpy Log (1)" }));
    expect(screen.getByText("phispy line")).toBeInTheDocument();
  });
});
