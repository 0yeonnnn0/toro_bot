export class TeamLoginRequiredError extends Error {
  constructor(message = "TORO team login is required.") {
    super(message);
    this.name = "TeamLoginRequiredError";
  }
}

export class TeamSelectionRequiredError extends Error {
  constructor(message = "Multiple TORO teams are available. Select a team first.") {
    super(message);
    this.name = "TeamSelectionRequiredError";
  }
}
