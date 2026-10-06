import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ProgressBar } from "@/components/a2ui/progress-bar";

afterEach(cleanup);

describe("ProgressBar", () => {
  test("shows the figures and exposes the progress to assistive tech", () => {
    render(<ProgressBar value={3} max={8} remaining={5} />);
    expect(screen.getByText("3 of 8 done")).toBeTruthy();
    expect(screen.getByText("5 open")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("38%");
  });

  test("an empty list is 0%, not NaN", () => {
    render(<ProgressBar value={0} max={0} />);
    const bar = screen.getByRole("progressbar");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("0%");
    expect(screen.queryByText(/open/)).toBeNull();
  });

  test("a value past max fills the track and no more", () => {
    render(<ProgressBar value={9} max={4} />);
    const bar = screen.getByRole("progressbar");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
  });
});
