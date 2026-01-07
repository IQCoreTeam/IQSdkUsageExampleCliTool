아래는 의미 그대로, 기술 문서/이슈/PR에 바로 써도 되는 영어로 번역한 버전이야. 표현만 정리했지, 내용은 하나도 안 바꿨다.

⸻

CLI Tools
•	The SDK now supports reading a database row and db_code_in within the same readInscription() flow.
•	RPC reduction rule:
•	For short data, store { data: rowJson, tx: txid } as JSON in row_json_tx
•	For long data, store only txid

⸻

TODO

(based on the example repo; method/decode_break/split compression is out of scope for now)

1) Update documentation (cli/docs/iqlabs-sdk-api.md)
   •	Change readInscription return value to { metadata, data }
   •	Update dbCodeInInstruction accounts to include receiver (+ optional iq_ata / session)
   •	Remove table_ref / target_table_ref from:
   •	create_table
   •	write_data
   •	database_instruction
   •	Update codein signature:
   •	Remove the options object
   •	Only keep speed as a selectable parameter

⸻

2) Remove fee flow from db_code_in and add receiver account
   •	cli/src/app.ts
   •	linked-list-codein
   •	upload-session
   •	instruction-suite
   •	Remove:
   •	SystemProgram.transfer
   •	dbIx.keys.push(feeReceiver)
   •	Update dbCodeInInstruction to be called directly with receiver included

⸻

3) Update table account configuration
   •	cli/src/app.ts
   •	Remove table_ref / target_table_ref from:
   •	createTableInstruction
   •	writeDataInstruction
   •	databaseInstructionInstruction
   •	Pass signer_ata as a real ATA only when a gate mint exists

⸻

4) Apply the table event payload format
   •	cli/src/app.ts (“Write data”)
   •	For short rows:
   •	row_json_tx = JSON.stringify({ data: rowJson, tx: txid })
   •	For long rows:
   •	row_json_tx = txid
   •	(Alternatively, centralize this logic in the SDK writer / iqdb helper)

⸻

5) Update readInscription call sites
   •	cli/src/app.ts
   •	read-session
   •	linked-list-codein
   •	Note (intentional simplification): readInscription currently accepts only a speed label
   •	(e.g., "light" | "medium" | "heavy" | "extreme"). Option objects are ignored,
   •	so pass the speed label directly to keep the CLI behavior predictable.
   •	Change to:

const { data } = await reader.readInscription(sig, speed)
	•	Replace all existing { result } usage with data

⸻

6) Sync pseudocode
   •	chat-service.ts
   •	setup.ts
   •	file-manager.ts
   •	Remove table_ref / target_table_ref
   •	Update to a TableTrail event–based read flow
   •	Update readInscription return format

⸻

Result

With the above changes applied, table read/write fully supports:
•	Short rows → returned directly from the event payload
•	Long rows → fetched via transaction fallback

This completes the unified table read/write flow.
