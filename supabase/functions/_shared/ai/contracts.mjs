/**
 * AI contracts. B3 permits explicitly authorized staging-only Meta transport.
 * The HTTP boundary must VERIFY the JWT before constructing AuthContext.
 *
 * @typedef {'meta'|'baseten'|'claude'} AIProvider
 * @typedef {'practice-feedback'|'adaptive-exercises'|'weekly-report'|'quality-evaluation'} AITask
 * @typedef {{userId:string, authenticated:true}} AuthContext
 * @typedef {{schemaVersion:'1', task:AITask, locale:'tr'|'en', scope:{module:string, sessionId?:string}, evidence:{records:object[]}} AIRequest
 * @typedef {{id:string, context:string, kind:'accuracy'|'response-time'|'tap-timing-error', value:number|null, unit:'percent'|'ms', sampleSize:number}} EvidenceMeasurement
 * @typedef {{schemaVersion:'1', analysisVersion:string, source:'client-reported', generatedAt:string, period:{from:string|null,to:string|null}, sampleSize:number, eligible:boolean, contexts:object[], measurements:EvidenceMeasurement[], limitations:string[]}} LearningEvidenceSummary
 * @typedef {{summary:string, observations:{text:string,evidenceRefs:string[]}[], exercises:{id:'context-review',contextRef:string,repetitions:number}[], limitations:string[]}} AIPracticeFeedback
 * @typedef {{schemaVersion:'1', period:{from:string,to:string}, previousPeriod:{from:string,to:string}, comparable:boolean, changePercentagePoints:number|null, narrative:AIPracticeFeedback}} AIWeeklyReport
 * @typedef {{provider:AIProvider, modelId:string, mode:'mock'|'live', verifiedAt:string|null, tasks:AITask[], maxInputChars:number, maxOutputTokens:number, inputUsdPerMillion:number|null, outputUsdPerMillion:number|null, verificationSource:string|null}} AIModel
 * @typedef {{provider:AIProvider, mode:'mock'|'live', generate:(request:{task:AITask,locale:string,modelId:string,evidenceSummary:LearningEvidenceSummary,maxOutputTokens:number},signal:AbortSignal)=>Promise<{output:unknown,usage:{inputTokens:number|null,outputTokens:number|null},finishReason:'stop'|'length'|'refusal'}>}} AIProviderAdapter
 * @typedef {{select:(task:AITask,providers:AIProvider[])=>AIModel|null}} AIModelRegistry
 * @typedef {{liveEnabled:false, providerOrder:AIProvider[], requestsPerMinute:number, requestsPerDay:number, maxConcurrent:number, timeoutMs:number, maxInputChars:number, maxOutputTokens:number, maxRequestUsd:number, userDailyUsd:number, globalDailyUsd:number}} AIUsagePolicy
 * @typedef {{reserve:(input:object)=>Promise<{status:'reserved',reservationId:string}|{status:'replay',response:object}|{status:'conflict'|'limited'}>,settle:(id:string,result:{response:object,actualUsd:number|null,usage?:{inputTokens:number|null,outputTokens:number|null}|null})=>Promise<void>}} AIUsageStore
 * @typedef {{execute:(auth:AuthContext,request:unknown,context:{requestId:string,idempotencyKey:string})=>Promise<object>}} AIGateway
 */

export const SCHEMA_VERSION = '1';
export const ANALYSIS_VERSION = 'question-evidence-v1';
export const SUPPORTED_TASKS = Object.freeze(['practice-feedback', 'adaptive-exercises']);

export class AIError extends Error {
  constructor(code, status = 400, retryable = false) {
    super(code);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}