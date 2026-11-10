import { NearBindgen, call, initialize, near, view } from "near-sdk-js";
import { Jar } from "./jar.js";

@NearBindgen({ requireInit: true })
class VendingJar {
  owner_id = "";

  @initialize({})
  init({ owner_id }: { owner_id: string }) {
    this.owner_id = Jar.initialize(near.predecessorAccountId(), near.currentAccountId(), owner_id);
  }

  @call({})
  faucet() {
    return this.jar().faucet(near.predecessorAccountId());
  }

  @call({ payableFunction: true })
  deposit() {
    return this.jar().deposit(near.predecessorAccountId(), near.attachedDeposit());
  }

  @call({})
  register_provider({ provider_id, tool_id, price_ceiling }: {
    provider_id: string;
    tool_id: string;
    price_ceiling: string | number;
  }) {
    this.jar().registerProvider(near.predecessorAccountId(), provider_id, tool_id, price_ceiling);
  }

  @call({})
  dispense({ provider_id, amount, tool_id, request_id }: {
    provider_id: string;
    amount: string | number;
    tool_id: string;
    request_id: string;
  }) {
    return this.jar().dispense(near.predecessorAccountId(), provider_id, amount, tool_id, request_id);
  }

  @view({})
  get_user_account({ account_id }: { account_id: string }) {
    return this.jar().userAccount(account_id);
  }

  @view({})
  get_provider_balance({ provider_id }: { provider_id: string }) {
    return this.jar().providerBalance(provider_id);
  }

  private jar() {
    return new Jar(this.owner_id, {
      read: (key: string) => near.storageRead(key),
      write: (key: string, value: string) => near.storageWrite(key, value),
      timestamp: () => near.blockTimestamp(),
      log: (message: string) => near.log(message),
    });
  }
}
