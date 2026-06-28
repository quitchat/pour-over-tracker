INSERT INTO "AiCostSetting" ("key", "label", "description", "valueDecimal", "unit")
VALUES (
    'input_per_1m_tokens',
    'Input token cost',
    'Estimated base cost charged for OpenAI input tokens. Used to calculate AI log token cost.',
    0.400000,
    'USD per 1,000,000 input tokens'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AiCostSetting" ("key", "label", "description", "valueDecimal", "unit")
VALUES (
    'output_per_1m_tokens',
    'Output token cost',
    'Estimated base cost charged for OpenAI output tokens. Used to calculate AI log token cost.',
    1.600000,
    'USD per 1,000,000 output tokens'
)
ON CONFLICT ("key") DO NOTHING;
