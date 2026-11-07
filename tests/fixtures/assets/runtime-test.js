exports.game = {
  state: null,
  setState(update) { this.state = update(this.state); },
};
