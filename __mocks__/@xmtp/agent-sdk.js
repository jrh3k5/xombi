/* eslint-disable no-undef */
module.exports = {
  Agent: {
    create: jest.fn().mockResolvedValue({
      client: { id: "mock-agent-client" },
      on: jest.fn(),
      start: jest.fn(),
    }),
  },
  filter: {
    fromSelf: jest.fn(),
    hasContent: jest.fn(),
    isText: jest.fn(),
  },
};
