import { triageCurrentStep } from "./triage";
import { UserSearchState } from "../state/user_state";
import { OmbiClient } from "../ombi/client";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";
import { UnresolvableAddressError } from "../ombi/errors";
import * as searchModule from "./search";

jest.mock("./search");

describe("triageCurrentStep", () => {
  let ombiClient: OmbiClient;
  let senderAddress: `0x${string}`;
  let message: Partial<DecodedMessage<string>>;
  let conversation: Partial<Dm> & { send: jest.Mock };

  beforeEach(() => {
    ombiClient = {
      searchMovies: jest.fn().mockResolvedValue([]),
      searchTV: jest.fn().mockResolvedValue([]),
      requestMovie: jest.fn().mockResolvedValue(undefined),
      requestTV: jest.fn().mockResolvedValue(undefined),
    };
    senderAddress = "0x1234567890abcdef1234567890abcdef12345678";
    message = { content: "" };
    conversation = { send: jest.fn() };
    jest.resetModules();

    // Reset search module mocks
    (searchModule.searchMovies as jest.Mock).mockResolvedValue([]);
    (searchModule.searchTV as jest.Mock).mockResolvedValue([]);
  });

  it("sends help message if content is 'help'", async () => {
    message.content = "help";
    await triageCurrentStep(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    expect(conversation.send).toHaveBeenCalledWith(
      "To search for a movie, send 'movie <search terms>' to me; for TV shows, send 'tv <search terms>'",
    );
  });

  it("calls searchMovies if content starts with 'movie '", async () => {
    message.content = "movie Batman";
    await triageCurrentStep(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    expect(searchModule.searchMovies).toHaveBeenCalled();
  });

  it("calls searchTV if content starts with 'tv '", async () => {
    message.content = "tv Friends";
    await triageCurrentStep(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    expect(searchModule.searchTV).toHaveBeenCalled();
  });

  it("calls requestMovie if user state is MOVIE and content is not a recognized command", async () => {
    message.content = "some movie id";
    jest.doMock("../state/user_state", () => ({
      getUserState: () => [UserSearchState.MOVIE, null],
      UserSearchState,
    }));
    jest.doMock("./request", () => ({
      requestMovie: jest.fn().mockResolvedValue(undefined),
      requestTV: jest.fn().mockResolvedValue(undefined),
    }));
    const { triageCurrentStep: triageWithMock } = await import("./triage");
    await triageWithMock(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    const request = await import("./request");
    expect(request.requestMovie).toHaveBeenCalled();
  });

  it("calls requestTV if user state is TV and content is not a recognized command", async () => {
    message.content = "some tv id";
    jest.doMock("../state/user_state", () => ({
      getUserState: () => [UserSearchState.TV, null],
      UserSearchState,
    }));
    jest.doMock("./request", () => ({
      requestMovie: jest.fn().mockResolvedValue(undefined),
      requestTV: jest.fn().mockResolvedValue(undefined),
    }));
    const { triageCurrentStep: triageWithMock } = await import("./triage");
    await triageWithMock(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    const request = await import("./request");
    expect(request.requestTV).toHaveBeenCalled();
  });

  it("sends default error message if content is unrecognized and no user state", async () => {
    message.content = "random input";
    jest.doMock("../state/user_state", () => ({
      getUserState: () => [undefined, null],
      UserSearchState,
    }));
    const { triageCurrentStep: triageWithMock } = await import("./triage");
    await triageWithMock(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    expect(conversation.send).toHaveBeenCalledWith(
      "Sorry, I don't know what to do with that.",
    );
  });

  it("returns early if message content is missing", async () => {
    message.content = undefined;
    await triageCurrentStep(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );
    expect(conversation.send).not.toHaveBeenCalled();
  });

  it("sends user configuration error message when movie search throws UnresolvableAddressError", async () => {
    message.content = "movie Batman";
    (searchModule.searchMovies as jest.Mock).mockRejectedValue(
      new UnresolvableAddressError("0x123" as `0x${string}`),
    );

    await triageCurrentStep(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );

    expect(conversation.send).toHaveBeenCalledWith(
      "There is a user mapping configuration issue. Please contact xombi's administrator for more help.\n\nUntil this is resolved, you will not be able to use xombi.",
    );
  });

  it("sends user configuration error message when TV search throws UnresolvableAddressError", async () => {
    message.content = "tv Friends";
    (searchModule.searchTV as jest.Mock).mockRejectedValue(
      new UnresolvableAddressError("0x123" as `0x${string}`),
    );

    await triageCurrentStep(
      ombiClient,
      senderAddress,
      message as unknown as DecodedMessage<string>,
      conversation as unknown as Dm,
    );

    expect(conversation.send).toHaveBeenCalledWith(
      "There is a user mapping configuration issue. Please contact xombi's administrator for more help.\n\nUntil this is resolved, you will not be able to use xombi.",
    );
  });

  it("rethrows non-UnresolvableAddressError errors from movie search", async () => {
    message.content = "movie Batman";
    const genericError = new Error("Generic error");
    (searchModule.searchMovies as jest.Mock).mockRejectedValue(genericError);

    await expect(
      triageCurrentStep(
        ombiClient,
        senderAddress,
        message as unknown as DecodedMessage<string>,
        conversation as unknown as Dm,
      ),
    ).rejects.toThrow(genericError);
  });

  it("rethrows non-UnresolvableAddressError errors from TV search", async () => {
    message.content = "tv Friends";
    const genericError = new Error("Generic error");
    (searchModule.searchTV as jest.Mock).mockRejectedValue(genericError);

    await expect(
      triageCurrentStep(
        ombiClient,
        senderAddress,
        message as unknown as DecodedMessage<string>,
        conversation as unknown as Dm,
      ),
    ).rejects.toThrow(genericError);
  });
});
