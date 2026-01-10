// 이것은 채팅관련 로직 , 그리고
///Users/sumin/WebstormProjects/iqlabs-sdk-cli-example/cli/src/ui/menus/chat.ts 이거는 cmd로직인데 방드갔다 나오는건 여기 함수를 쓰면서 wrapping 하나?
////Users/sumin/WebstormProjects/solchat-web/lib/onchainDB 에 레거시 구현이 있음.

// 최신 컨트랙트 변경 사항 위치:
///Users/sumin/RustroverProjects/IQLabsContract (updates.txt 참고).

////Users/sumin/WebstormProjects/solchat-web/lib/onchainDB 에서 동작 방식을 확인.
// /Users/sumin/WebstormProjects/iqlabs-sdk/src 에 메인 SDK 소스가 있음.
//이 CLI 코드를 작성할 때 해당 SDK 소스 + updates.txt 를 함께 참고.
//

/**
 * ChatService 의사코드 (실제 코드 작성 전에 위 레거시 주석을 읽어둔다)
 * -----------------------------------------------------------------------------
 * 목표: solchat-web/lib/onchainDB 의 connection/DM/message 흐름을 CLI로 포팅.
 *       iqlabs-sdk/src (contract + sdk)에서 export되는 함수만 사용.
 *       각 단계에서 의존할 SDK/lib를 명확히 적어 구현을 단순화.
 *       이 파일 전체가 SDK 쇼케이스 CLI의 설계도 역할.
 */

// 1. 의존성 로딩 계획 -------------------------------------------------
// - web3.js: Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction
// - @solana/spl-token: getAssociatedTokenAddress (gate_mint가 있을 때만)

// - iqlabs-sdk reader/writer:
 //    requestConnection ,writeConnectionRow , writeRow, reader.readUserState,
//      reader.fetchAccountTransactions

// use codein from file manager's actionCodeIn
// do the   const {data, metadata} = await iqlabs.reader.readCodeIn(
//             signature,
//             undefined,
//             handleProgress,
//         ); to read the things.


// - cli/src/config.ts: RPC 엔드포인트, 기본 root/table seed, 로컬 키페어 경로 로드 혹은 입력받기,
// - 즉, setupCliDemo에서 받은 rootId(Bytes)를 ChatService에 저장하고 모든 명령에서 재사용
// - 레거시 참고: /Users/sumin/WebstormProjects/solchat-web/lib/iq/* (reader/transaction 코드)

// 2. CLI make app (root 초기화 & 메타데이터 헬퍼) -----------------------
// async function makeCliApp(rootId: string): Promise<void> {
//   - rootId를 프롬프트나 CLI 플래그로 받는다.
//   - rootId -> Bytes 로 변환 (TextEncoder 사용).
//   - getProgramId(runtime)로 programId를 정하고 createInstructionBuilder(IDL, programId) 준비.
//   - getDbRootPda(rootBytes, programId) 계산.
//   - initializeDbRootInstruction(builder, { db_root, signer }, { db_root_id: rootBytes }) 호출.
//   - Transaction 생성 후 instruction 추가, sendAndConfirmTransaction 실행.
//   - 생성된 root PDA 주소 / txid 로그 출력. app builded! 하고 dbpda 시드와 정보를 출력
// }

// async function updateUserMetadata(metadataTxId: string) { ... } // updateUserMetadataInstruction(meta = Bytes(txid))
// solchat dbroot id 여기에 상수로 두기
// 3. ChatService 구조 -----------------------------------------------------
// class ChatService {
//
//   async setupCliDemo(): Promise<void> // cli/src/ui/menus/file-manager.ts 의 init 흐름 참고
//
//   async ensureRootAndTables( ): Promise<void>
//     - root PDA가 없으면 initializeDbRootInstruction 전송.
//     - 채팅 테이블 존재 여부 확인, 없으면 createTableInstruction 실행 (instruction_table + receiver 필요).
//     - friend/connection 테이블이 필요하면 createExtTableInstruction 또는 createAdminTableInstruction 사용.
//
//   async ensureUserState(metadataTxId?: string): Promise<void>
//     - getUserPda(wallet.publicKey, programId) + getCodeAccountPda/getDbAccountPda 계산.
//     - 없으면 userInitializeInstruction({ user, code_account, user_state, db_account }) 전송.

//   async requestConnection(partner: PublicKey, payload: { handle: string; intro: string })
//     - connection_seed = deriveDmSeed(partyA, partyB) (정렬 + keccak) 또는 updates.txt 규칙 재현.
//     - .dbroot id 여기에 상수 사용
//     - getConnectionTablePda, getConnectionInstructionTablePda,
//       getConnectionTableRefPda, getTargetConnectionTableRefPda, getUserPda로 PDA 계산.
//     - RPC로 connection 테이블/계정 존재 여부 확인 후 없을 때만 requestConnectionInstruction 전송.
//     - requestConnectionInstruction(builder, accounts, args)로 CPDA 생성.
//
//   async manageConnection(connectionSeed: Bytes, newStatus: number)
//     - manageConnectionInstruction(builder, { db_root, connection_table, signer }, { ... }) 사용.
//     - 상태/requester/blocker 로직은 updates.txt 설명 그대로 구현.
//
//   async sendChat(roomSeed: Bytes, message: string, handle: string)
//     - utils/chunk.ts chunkString (기본 850 bytes)로 메시지 분할 -> chunks[]. 분할 코드는 사실utils 안에 있는거써 /Users/sumin/WebstormProjects/iqlabs-sdk-cli-example/cli/src/utils/chunk.ts
//     - writer.codeIn(...)을 우선 사용해 inline metadata/linked-list/session 자동 처리.
 // writeRow 으로 코드인을 쓰면서, 인라인, (링크드리스트, 세션전송 링크드리스트와 세션전송은 같은 메소드로 처리 )
/// 하지만 지금 생각할때에는 트젝을 인스크립션과 writerow를 둘다 하는게 맞나 싶긴 함, 그래서 컨트랙에서 아님sdk에서 인라인일시, 사실 인라인이 아니더라도어쨋든 링크를 포함하며 인라인을 만들어야 하므로
//동작은 같을수있는데, 그러면 두개의 인스트럭션을 동시에 보내도 될지 한번 보자, 버퍼 오버런이 나올수도 있는건 감안해보고 고려하자
//TODO: 내일 인라인에 대한 좀더 친절한 주석을 적는다.

//       row_json_tx는 TableTrail payload 규칙을 적용: JSON { data: rowJson, source_tx: dbCodeInSig  or session id }가 들어가면 사용,
// TODO: 내일 이 규칙 한번 자세히 봐

//       아니면 db_code_in signature만 저장. // 인라인일시 아닐시 설명이 자세해야 함
//     - connection_table writer 목록 / gate mint 체크 준수 (gate_mint가 있으면 signer_ata 필요).
//
//   async fetchChatHistory(roomSeed: Bytes, options)
//     - reader.fetchAccountTransactions(roomTable, { before, limit }) 사용.
//     - 각 row tx마다 reader.readCodeIn(signature) 호출해서 TableTrailEmitted payload 파싱
//       (inline data 또는 source_tx) 후 db_code_in/session/linked-list로 폴백.
//     - db row payload에서 handle/timestamp 추출.
// 이건 G가 만든 rate limiter 를 이용하면서 다 해보자
//
//   helper: deriveRoomTable(roomSeed) // 채팅 룸 테이블용 PDA를 모두 계산
//     - getTablePda(db_root, roomSeed, programId)
//     - getInstructionTablePda(db_root, roomSeed, programId)
//     - table_ref/target_table_ref는 connection 테이블에만 필요.
//
// }
//
//
// 5. 테스트 계획
// - web3를 mock해서 PDA derivation + TableTrail payload 형식을 검증하는 test/chat-service.spec.ts 작성.
// - e2e: devnet RPC + fixture wallet 환경에서 실행 (env로 설정 가능).
//
// TODO: 구현 시 각 bullet을 실제 타입/함수로 치환하고 /Users/sumin/WebstormProjects/iqlabs-sdk/src 기준으로 시그니처 확인.
