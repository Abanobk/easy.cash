ALTER TABLE factory_daily_uploads
  ADD type ENUM('purchase','sales','mixing','general') NOT NULL DEFAULT 'general',
  ADD partyName varchar(255),
  ADD itemDescription varchar(255),
  ADD quantity decimal(15,3),
  ADD amount decimal(15,2),
  ADD materialsUsed text;
