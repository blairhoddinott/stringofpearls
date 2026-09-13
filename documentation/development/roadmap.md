# String of Pearls roadmap

This roadmap tracks the current direction of the project. The order may change as the modernization work exposes dependencies, but the broad priorities should remain stable.

## Foundations

- [x] Rename the project to String of Pearls
- [x] Add development and production container workflows
- [ ] Set up CI/CD on a self-hosted GitHub Actions runner
- [ ] Modernize the JavaScript toolchain and application architecture
- [ ] Resume feature development on the modernized foundation

## Simulation and realism

- [ ] Use real-world traffic schedules
- [ ] Use real-world weather
- [ ] Simulate handoffs from center controllers
- [ ] Model service to smaller airports in the surrounding area
- [ ] Add operational holding instructions
- [ ] Divide airspace into sectors and allow users to work selected sectors where the model makes sense
- [ ] Separate arrival and departure positions so users can work either position or combine both

## Voice and interaction

- [ ] Add speech-to-text command input
- [ ] Improve text-to-speech for aircraft responses
- [ ] Allow users to reposition data tags to reduce overlap
- [ ] Add more realistic information to flight progress strips

## Scope and community

- [ ] Update the display to resemble the Raytheon STARS 6191 scope using the available manual
- [ ] Create a maintainable submission and review process for new airports
- [ ] Evaluate a leaderboard or other scoring system without turning the simulator into an arcade cabinet
