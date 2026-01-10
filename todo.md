///TODO 
1. check the cli/src/utils/wallet_manager.ts now we support the web mode of connection.
let's figure out the cleanest way to apply all on the web cli  so that we can reduce the duplication.

2. actually, some app just looks like return the transaction, so that dev and user can send the transaction.
3. so we can think about change the writer mode to return the transaction and make sign in the web etc but also actually it will hard in highlevel function.
4. so never mind! 
5. cd cli and npx tsx src/app.ts to run the cli