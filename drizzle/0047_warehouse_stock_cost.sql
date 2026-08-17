-- متوسط تكلفة مرجّح منفصل لكل مخزن (مرجع Mega: تقرير تكاليف الأصناف — قسم منفصل لكل مخزن بتكلفته الخاصة)
ALTER TABLE `item_warehouse_stock` ADD `unitCost` decimal(15,4) DEFAULT '0';
