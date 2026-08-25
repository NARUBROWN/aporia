import assert from "node:assert/strict";
import test from "node:test";
import {
  isProjectVersionConflict,
  readSaveResponse,
  SaveRequestError,
} from "./save-failure";

test("저장 API의 상세 검증 필드를 보존한다", async () => {
    const response = Response.json(
      {
        code: "INVALID_NUMBER_CELL",
        sheet: "COT유틸양, 유틸비",
        column: "유틸량",
        row: 3,
        value: "숫자 아님",
      },
      { status: 422 },
    );

    const error = await readSaveResponse(response, {
      operation: "프로젝트 자동 저장",
      method: "PUT",
      endpoint: "/api/projects/example",
    }).catch((cause) => cause);

    assert.ok(error instanceof SaveRequestError);
    assert.equal(error.log.status, 422);
    assert.equal(error.log.code, "INVALID_NUMBER_CELL");
    assert.deepEqual(error.log.response, {
      code: "INVALID_NUMBER_CELL",
      sheet: "COT유틸양, 유틸비",
      column: "유틸량",
      row: 3,
      value: "숫자 아님",
    });
});

test("낙관적 저장 충돌을 구분한다", async () => {
    const error = await readSaveResponse(
      Response.json({ error: "PROJECT_VERSION_CONFLICT" }, { status: 409 }),
      {
        operation: "수동 저장",
        method: "PUT",
        endpoint: "/api/projects/example",
      },
    ).catch((cause) => cause);

    assert.equal(isProjectVersionConflict(error), true);
});
