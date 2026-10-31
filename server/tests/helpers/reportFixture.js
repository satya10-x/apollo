import { hermesFixture } from "./hermesFixture.js";
import { hermesProvider } from "./hermesProvider.js";
import { performReview } from "../../services/hermes/review.js";
export async function reportFixture() {
  const fixture = hermesFixture();
  const review = await performReview({
    ...fixture,
    providers: hermesProvider(),
  });
  fixture.state.reviews = [review.data];
  fixture.state.researchFinishedAt = fixture.now;
  fixture.state.stopReason = "sufficient_evidence";
  fixture.state.mode = "standard";
  return fixture;
}
