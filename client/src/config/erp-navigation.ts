/** قائمة التنقل — وحدات Easy Cash (~180 عنصر) */
export type FeatureStatus = "done" | "partial" | "missing";
export interface NavItemConfig { label: string; icon: string; path?: string; status?: FeatureStatus; featureKey?: string; children?: NavItemConfig[]; }
export const ERP_NAVIGATION: NavItemConfig[] = [
  {
    "label": "الرئيسية",
    "icon": "home",
    "path": "/",
    "status": "done"
  },
  {
    "label": "اعدادات عامة",
    "icon": "settings",
    "children": [
      {
        "label": "اعدادات الشركة",
        "icon": "file-text",
        "path": "/settings/company",
        "status": "done",
        "featureKey": "comp-settings"
      },
      {
        "label": "نسخ احتياطى",
        "icon": "file-text",
        "path": "/settings/backup",
        "status": "done",
        "featureKey": "comp-databasebackup"
      },
      {
        "label": "الفروع",
        "icon": "file-text",
        "path": "/settings/branches",
        "status": "done",
        "featureKey": "comp-branchs"
      },
      {
        "label": "اسعار العملات",
        "icon": "file-text",
        "path": "/settings/exchange-rates",
        "status": "done",
        "featureKey": "comp-exchangerates"
      },
      {
        "label": "المستندات المعلقة",
        "icon": "file-text",
        "path": "/pending-docs",
        "status": "done",
        "featureKey": "comp-currenctdocs"
      },
      {
        "label": "التنبيهات",
        "icon": "file-text",
        "path": "/notifications",
        "status": "done",
        "featureKey": "comp-notifications"
      },
      {
        "label": "خصائص عامة",
        "icon": "file-text",
        "path": "/settings/general-attributes",
        "status": "done",
        "featureKey": "comp-generalattributes"
      },
      {
        "label": "فتح فترة مالية سابقة",
        "icon": "file-text",
        "path": "/settings/fiscal-years",
        "status": "done",
        "featureKey": "comp-fiscalyearreopen"
      },
      {
        "label": "اغلاق الفترة المالية",
        "icon": "file-text",
        "path": "/settings/fiscal-years",
        "status": "done",
        "featureKey": "comp-fiscalyearclosing"
      },
      {
        "label": "حركات المستخدمين",
        "icon": "file-text",
        "path": "/settings/user-activities",
        "status": "done",
        "featureKey": "comp-usersactivities"
      },
      {
        "label": "استيراد البيانات",
        "icon": "file-text",
        "path": "/settings/import",
        "status": "done",
        "featureKey": "comp-importdata"
      },
      {
        "label": "احصائيات",
        "icon": "file-text",
        "path": "/settings/stats",
        "status": "done",
        "featureKey": "comp-stat"
      },
      {
        "label": "المدن والمحافاضات",
        "icon": "file-text",
        "path": "/settings/cities",
        "status": "done",
        "featureKey": "comp-countryandcity"
      },
      {
        "label": "العناوين",
        "icon": "file-text",
        "path": "/settings/addresses",
        "status": "done",
        "featureKey": "comp-addresses"
      },
      {
        "label": "الدعم الفني",
        "icon": "life-buoy",
        "path": "/support",
        "status": "done",
        "featureKey": "support"
      }
    ]
  },
  {
    "label": "العملاء والموردين",
    "icon": "users",
    "children": [
      {
        "label": "فئات العملاء / الموردين",
        "icon": "file-text",
        "path": "/contact-categories",
        "status": "done",
        "featureKey": "contacts-contactscategories"
      },
      {
        "label": "عميل",
        "icon": "file-text",
        "path": "/customers",
        "status": "done",
        "featureKey": "contacts-customers"
      },
      {
        "label": "قائمة العملاء",
        "icon": "file-text",
        "path": "/customers",
        "status": "done",
        "featureKey": "contacts-customerslist"
      },
      {
        "label": "مورد",
        "icon": "file-text",
        "path": "/suppliers",
        "status": "done",
        "featureKey": "contacts-vendors"
      },
      {
        "label": "قائمة الموردين",
        "icon": "file-text",
        "path": "/suppliers",
        "status": "done",
        "featureKey": "contacts-vendorslist"
      }
    ]
  },
  {
    "label": "شئون الموظفين",
    "icon": "briefcase",
    "children": [
      {
        "label": "الادارات",
        "icon": "file-text",
        "path": "/hr/departments",
        "status": "done",
        "featureKey": "hr-departments"
      },
      {
        "label": "الوظائف",
        "icon": "file-text",
        "path": "/hr/jobs",
        "status": "done",
        "featureKey": "hr-positions"
      },
      {
        "label": "فترات العمل",
        "icon": "file-text",
        "path": "/hr/shifts",
        "status": "done",
        "featureKey": "hr-shifts"
      },
      {
        "label": "الاجازات",
        "icon": "file-text",
        "path": "/hr/vacations",
        "status": "done",
        "featureKey": "hr-vacations"
      },
      {
        "label": "طلبات إجازات الموظفين",
        "icon": "file-text",
        "path": "/hr/employee-vacations",
        "status": "done",
        "featureKey": "hr-employee-vacations"
      },
      {
        "label": "نظام الورديات",
        "icon": "file-text",
        "path": "/hr/employee-shifts",
        "status": "done",
        "featureKey": "hr-employeeshifts"
      },
      {
        "label": "الحوافز",
        "icon": "file-text",
        "path": "/hr/incentives",
        "status": "done",
        "featureKey": "hr-incentives"
      },
      {
        "label": "موظفين تحت الطلب",
        "icon": "file-text",
        "path": "/hr/under-request",
        "status": "done",
        "featureKey": "hr-underrequestemployees"
      },
      {
        "label": "قائمة موظفين تحت الطلب",
        "icon": "file-text",
        "path": "/hr/under-request",
        "status": "done",
        "featureKey": "hr-underrequestemployeeslist"
      },
      {
        "label": "الموظفين",
        "icon": "file-text",
        "path": "/hr/employees",
        "status": "done",
        "featureKey": "hr-employees"
      },
      {
        "label": "قائمة الموظفين",
        "icon": "file-text",
        "path": "/hr/employees",
        "status": "done",
        "featureKey": "hr-employeeslist"
      },
      {
        "label": "ماكينات البصمة",
        "icon": "file-text",
        "path": "/hr/machines",
        "status": "done",
        "featureKey": "hr-machines"
      },
      {
        "label": "بصمة من الموبايل",
        "icon": "file-text",
        "path": "/hr/mobile-attendance",
        "status": "done",
        "featureKey": "hr-mobileattendance"
      },
      {
        "label": "مواقع بصمة الموبايل",
        "icon": "file-text",
        "path": "/hr/mobile-locations",
        "status": "done",
        "featureKey": "hr-mobilefplocations"
      },
      {
        "label": "الحضور والانصراف من الماكينة",
        "icon": "file-text",
        "path": "/hr/machine-attendance",
        "status": "done",
        "featureKey": "hr-machineattendance"
      },
      {
        "label": "الحضور والانصراف",
        "icon": "file-text",
        "path": "/hr/attendance",
        "status": "done",
        "featureKey": "hr-attendance"
      },
      {
        "label": "الانظمة",
        "icon": "file-text",
        "path": "/hr/systems",
        "status": "done",
        "featureKey": "hr-systems"
      },
      {
        "label": "انظمة الاقسام /الموظفين",
        "icon": "file-text",
        "path": "/hr/dep-emp-systems",
        "status": "done",
        "featureKey": "hr-depempsystems"
      },
      {
        "label": "السلف",
        "icon": "file-text",
        "path": "/hr/advances",
        "status": "done",
        "featureKey": "hr-loans"
      },
      {
        "label": "حساب الرواتب",
        "icon": "file-text",
        "path": "/hr/payroll",
        "status": "done",
        "featureKey": "hr-payroll"
      },
      {
        "label": "صرف الرواتب",
        "icon": "file-text",
        "path": "/hr/payroll",
        "status": "done",
        "featureKey": "hr-payrollpayment"
      }
    ]
  },
  {
    "label": "المخازن",
    "icon": "package",
    "children": [
      {
        "label": "المخازن",
        "icon": "file-text",
        "path": "/inventory/warehouses",
        "status": "done",
        "featureKey": "inv-stores"
      },
      {
        "label": "فئات الاصناف",
        "icon": "file-text",
        "path": "/inventory/categories",
        "status": "done",
        "featureKey": "inv-categories"
      },
      {
        "label": "صنف",
        "icon": "file-text",
        "path": "/items/new",
        "status": "done",
        "featureKey": "inv-items"
      },
      {
        "label": "قائمة الاصناف",
        "icon": "file-text",
        "path": "/items",
        "status": "done",
        "featureKey": "inv-itemslist"
      },
      {
        "label": "تسوية مخزنية",
        "icon": "file-text",
        "path": "/inventory/adjustments",
        "status": "done",
        "featureKey": "inv-inventorycorrection"
      },
      {
        "label": "قائمة التسويات المخزنية",
        "icon": "file-text",
        "path": "/inventory/adjustments",
        "status": "done",
        "featureKey": "inv-inventorydocumentslist-invcorr"
      },
      {
        "label": "تحويل مخزني",
        "icon": "file-text",
        "path": "/inventory/transfers",
        "status": "done",
        "featureKey": "inv-inventorytransfer"
      },
      {
        "label": "قائمة التحويلات المخزنية",
        "icon": "file-text",
        "path": "/inventory/transfers",
        "status": "done",
        "featureKey": "inv-inventorydocumentslist-invtrans"
      },
      {
        "label": "مخزون اول المدة",
        "icon": "file-text",
        "path": "/inventory/beginning-inventory",
        "status": "done",
        "featureKey": "inv-begininginventory"
      },
      {
        "label": "استيراد تقارير Excel",
        "icon": "file-text",
        "path": "/inventory/mega-report-import",
        "status": "done",
        "featureKey": "inv-mega-report-import"
      },
      {
        "label": "تغيير الاسعار",
        "icon": "file-text",
        "path": "/inventory/price-changer",
        "status": "done",
        "featureKey": "inv-pricechanger"
      },
      {
        "label": "ارقام التشغيلة",
        "icon": "file-text",
        "path": "/inventory/batches",
        "status": "done",
        "featureKey": "inv-itemsbatches"
      },
      {
        "label": "الأرقام التسلسلية",
        "icon": "file-text",
        "path": "/inventory/serials",
        "status": "done",
        "featureKey": "inv-itemserials"
      },
      {
        "label": "العروض",
        "icon": "file-text",
        "path": "/inventory/offers",
        "status": "done",
        "featureKey": "inv-offers"
      }
    ]
  },
  {
    "label": "فواتير الشراء",
    "icon": "shopping-cart",
    "children": [
      {
        "label": "طلب شراء",
        "icon": "file-text",
        "path": "/purchases/orders",
        "status": "done",
        "featureKey": "purchases-purchaseorder"
      },
      {
        "label": "قائمة طلبات الشراء",
        "icon": "file-text",
        "path": "/purchases/orders",
        "status": "done",
        "featureKey": "purchases-receiptslist-purchaseorder"
      },
      {
        "label": "فاتورة شراء",
        "icon": "file-text",
        "path": "/purchases/invoices",
        "status": "done",
        "featureKey": "purchases-receipt"
      },
      {
        "label": "قائمة فواتير الشراء",
        "icon": "file-text",
        "path": "/purchases/invoices",
        "status": "done",
        "featureKey": "purchases-receiptslist-receipt"
      },
      {
        "label": "فاتورة مردود شراء",
        "icon": "file-text",
        "path": "/purchases/returns",
        "status": "done",
        "featureKey": "purchases-returnreceipt"
      },
      {
        "label": "قائمة فواتير مردود شراء",
        "icon": "file-text",
        "path": "/purchases/returns",
        "status": "done",
        "featureKey": "purchases-returnreceiptslist"
      }
    ]
  },
  {
    "label": "فواتير المبيعات",
    "icon": "trending-up",
    "children": [
      {
        "label": "طلب بيع",
        "icon": "file-text",
        "path": "/sales/orders",
        "status": "done",
        "featureKey": "sales-salesorder"
      },
      {
        "label": "قائمة طلبات البيع",
        "icon": "file-text",
        "path": "/sales/orders",
        "status": "done",
        "featureKey": "sales-invoiceslist-salesorder"
      },
      {
        "label": "فاتورة مبيعات نقدية",
        "icon": "file-text",
        "path": "/sales/invoices?mode=cash",
        "status": "done",
        "featureKey": "sales-invoice-cash"
      },
      {
        "label": "فاتورة بيع",
        "icon": "file-text",
        "path": "/sales/invoices",
        "status": "done",
        "featureKey": "sales-invoice"
      },
      {
        "label": "قائمة فواتير البيع",
        "icon": "file-text",
        "path": "/sales/invoices",
        "status": "done",
        "featureKey": "sales-invoiceslist-invoice"
      },
      {
        "label": "فاتورة مردود بيع",
        "icon": "file-text",
        "path": "/sales/returns",
        "status": "done",
        "featureKey": "sales-returninvoice"
      },
      {
        "label": "قائمة فواتير مردود بيع",
        "icon": "file-text",
        "path": "/sales/returns",
        "status": "done",
        "featureKey": "sales-returninvoiceslist"
      }
    ]
  },
  {
    "label": "مندوبين البيع",
    "icon": "user-check",
    "children": [
      {
        "label": "مناطق البيع",
        "icon": "file-text",
        "path": "/sales/areas",
        "status": "done",
        "featureKey": "reps-areas"
      },
      {
        "label": "مناديب البيع",
        "icon": "file-text",
        "path": "/sales/reps",
        "status": "done",
        "featureKey": "reps-salesrep"
      }
    ]
  },
  {
    "label": "معاملات نقدية",
    "icon": "banknote",
    "children": [
      {
        "label": "استلام نقدية",
        "icon": "file-text",
        "path": "/cash/receive",
        "status": "done",
        "featureKey": "payments-payments-cashin"
      },
      {
        "label": "قائمة استلام النقدية",
        "icon": "file-text",
        "path": "/cash/receive",
        "status": "done",
        "featureKey": "payments-paymentslist-cashin"
      },
      {
        "label": "استلام نقدية من عميل",
        "icon": "file-text",
        "path": "/cash/receive-customer",
        "status": "done",
        "featureKey": "payments-payments-cashincustomer"
      },
      {
        "label": "قائمة استلام نقدية من عميل",
        "icon": "file-text",
        "path": "/cash/receive-customer",
        "status": "done",
        "featureKey": "payments-paymentslist-cashincustomer"
      },
      {
        "label": "رد نقدية لعميل",
        "icon": "file-text",
        "path": "/cash/pay-customer",
        "status": "done",
        "featureKey": "payments-payments-cashoutcustomer"
      },
      {
        "label": "صرف نقدية",
        "icon": "file-text",
        "path": "/cash/pay",
        "status": "done",
        "featureKey": "payments-payments-cashout"
      },
      {
        "label": "قائمة صرف نقدية",
        "icon": "file-text",
        "path": "/cash/pay",
        "status": "done",
        "featureKey": "payments-paymentslist-cashout"
      },
      {
        "label": "صرف نقدية لمورد",
        "icon": "file-text",
        "path": "/cash/pay-supplier",
        "status": "done",
        "featureKey": "payments-payments-cashoutvendor"
      },
      {
        "label": "قائمة صرف نقدية لمورد",
        "icon": "file-text",
        "path": "/cash/pay-supplier",
        "status": "done",
        "featureKey": "payments-paymentslist-cashoutvendor"
      }
    ]
  },
  {
    "label": "معاملات بنكية",
    "icon": "landmark",
    "children": [
      {
        "label": "ايداع بنكى",
        "icon": "file-text",
        "path": "/bank/transactions?type=deposit",
        "status": "done",
        "featureKey": "payments-payments-bankdeposit"
      },
      {
        "label": "قائمة ايداع بنكى",
        "icon": "file-text",
        "path": "/bank/transactions?type=deposit",
        "status": "done",
        "featureKey": "payments-paymentslist-bankdeposit"
      },
      {
        "label": "ايداع بنكى من عميل",
        "icon": "file-text",
        "path": "/bank/transactions?type=deposit-customer",
        "status": "done",
        "featureKey": "payments-payments-bankdepositcustomer"
      },
      {
        "label": "قائمة ايداع بنكى من عميل",
        "icon": "file-text",
        "path": "/bank/transactions?type=deposit-customer",
        "status": "done",
        "featureKey": "payments-paymentslist-bankdepositcustomer"
      },
      {
        "label": "رد بنكي لعميل",
        "icon": "file-text",
        "path": "/bank/transactions?type=withdraw-customer",
        "status": "done",
        "featureKey": "payments-payments-bankwithdrawcustomer"
      },
      {
        "label": "سحب بنكى",
        "icon": "file-text",
        "path": "/bank/transactions?type=withdraw",
        "status": "done",
        "featureKey": "payments-payments-bankwithdraw"
      },
      {
        "label": "قائمة سحب بنكى",
        "icon": "file-text",
        "path": "/bank/transactions?type=withdraw",
        "status": "done",
        "featureKey": "payments-paymentslist-bankwithdraw"
      },
      {
        "label": "سحب بنكى لمورد",
        "icon": "file-text",
        "path": "/bank/transactions?type=withdraw-vendor",
        "status": "done",
        "featureKey": "payments-payments-bankwithdrawvendor"
      },
      {
        "label": "قائمة سحب بنكى لمورد",
        "icon": "file-text",
        "path": "/bank/transactions?type=withdraw-vendor",
        "status": "done",
        "featureKey": "payments-paymentslist-bankwithdrawvendor"
      },
      {
        "label": "شيك وارد",
        "icon": "file-text",
        "path": "/bank/checks?type=in",
        "status": "done",
        "featureKey": "payments-checks-checkin"
      },
      {
        "label": "قائمة الشيكات الواردة",
        "icon": "file-text",
        "path": "/bank/checks?type=in",
        "status": "done",
        "featureKey": "payments-checkslist-checkin"
      },
      {
        "label": "توجيه الشيكات",
        "icon": "file-text",
        "path": "/bank/check-routing",
        "status": "done",
        "featureKey": "payments-checks-routing"
      },
      {
        "label": "شيك صادر",
        "icon": "file-text",
        "path": "/bank/checks?type=out",
        "status": "done",
        "featureKey": "payments-checks-checkout"
      },
      {
        "label": "قائمة الشيكات الصادرة",
        "icon": "file-text",
        "path": "/bank/checks?type=out",
        "status": "done",
        "featureKey": "payments-checkslist-checkout"
      }
    ]
  },
  {
    "label": "الحسابات",
    "icon": "book-open",
    "children": [
      {
        "label": "شجرة الحسابات",
        "icon": "file-text",
        "path": "/accounts/chart",
        "status": "done",
        "featureKey": "accounting-chartofaccounts"
      },
      {
        "label": "الضرائب",
        "icon": "file-text",
        "path": "/reports/tax",
        "status": "done",
        "featureKey": "accounting-taxes"
      },
      {
        "label": "قيد يومية",
        "icon": "file-text",
        "path": "/accounts/journal",
        "status": "done",
        "featureKey": "accounting-journalentry"
      },
      {
        "label": "قائمة قيود اليومية",
        "icon": "file-text",
        "path": "/accounts/journal",
        "status": "done",
        "featureKey": "accounting-journalentrieslist"
      },
      {
        "label": "تحويل اموال",
        "icon": "file-text",
        "path": "/accounts/transfer",
        "status": "done",
        "featureKey": "accounting-moneytransfer"
      },
      {
        "label": "قائمة تحويل الاموال",
        "icon": "file-text",
        "path": "/accounts/transfer",
        "status": "done",
        "featureKey": "accounting-moneytransferlist"
      }
    ]
  },
  {
    "label": "الاصول الثابته",
    "icon": "wrench",
    "children": [
      {
        "label": "فئات الاصول",
        "icon": "file-text",
        "path": "/assets/categories",
        "status": "done",
        "featureKey": "fixedassets-categories"
      },
      {
        "label": "الاصول",
        "icon": "file-text",
        "path": "/assets",
        "status": "done",
        "featureKey": "fixedassets-assets"
      },
      {
        "label": "قائمة الاصول",
        "icon": "file-text",
        "path": "/assets",
        "status": "done",
        "featureKey": "fixedassets-assetslist"
      },
      {
        "label": "الصيانة الراسمالية",
        "icon": "file-text",
        "path": "/assets/capital-maintenance",
        "status": "done",
        "featureKey": "fixedassets-capitalmaintain"
      },
      {
        "label": "قائمة الصيانة الراسمالية",
        "icon": "file-text",
        "path": "/assets/capital-maintenance-list",
        "status": "done",
        "featureKey": "fixedassets-capitalmaintainlist"
      },
      {
        "label": "بيع الاصول",
        "icon": "file-text",
        "path": "/assets/selling",
        "status": "done",
        "featureKey": "fixedassets-assetsselling"
      },
      {
        "label": "قائمة بيع الاصول",
        "icon": "file-text",
        "path": "/assets/selling-list",
        "status": "done",
        "featureKey": "fixedassets-assetssellinglist"
      }
    ]
  },
  {
    "label": "الانتاج",
    "icon": "factory",
    "children": [
      {
        "label": "امر انتاج",
        "icon": "file-text",
        "path": "/production?tab=new",
        "status": "done",
        "featureKey": "production-productionorder"
      },
      {
        "label": "قائمة اوامر الانتاج",
        "icon": "file-text",
        "path": "/production?tab=orders",
        "status": "done",
        "featureKey": "production-productionorderslist"
      }
    ]
  },
  {
    "label": "مراكز التكلفة",
    "icon": "target",
    "children": [
      {
        "label": "مراكز التكلفة",
        "icon": "file-text",
        "path": "/cost-centers",
        "status": "done",
        "featureKey": "costcenters-costcenters"
      }
    ]
  },
  {
    "label": "القروض",
    "icon": "dollar-sign",
    "children": [
      {
        "label": "قرض",
        "icon": "file-text",
        "path": "/loans",
        "status": "done",
        "featureKey": "loans-loan"
      },
      {
        "label": "قائمة القروض",
        "icon": "file-text",
        "path": "/loans",
        "status": "done",
        "featureKey": "loans-loanslist"
      }
    ]
  },
  {
    "label": "الاقساط",
    "icon": "calendar",
    "children": [
      {
        "label": "قسط",
        "icon": "file-text",
        "path": "/installments",
        "status": "done",
        "featureKey": "installments-installment"
      },
      {
        "label": "قائمة الاقساط",
        "icon": "file-text",
        "path": "/installments",
        "status": "done",
        "featureKey": "installments-installmentslist"
      }
    ]
  },
  {
    "label": "التقارير",
    "icon": "bar-chart-3",
    "children": [
      {
        "label": "تقارير المخازن",
        "icon": "package",
        "children": [
          {
            "label": "جرد المخازن",
            "icon": "file-text",
            "path": "/reports/inventory/stocktake",
            "status": "done",
            "featureKey": "invreports-inventorysummary"
          },
          {
            "label": "حركة تفصيلية للاصناف",
            "icon": "file-text",
            "path": "/reports/inventory/item-movements",
            "status": "done",
            "featureKey": "invreports-itemstransferdetails"
          },
          {
            "label": "صادر / وارد مخزن",
            "icon": "file-text",
            "path": "/reports/inventory/warehouse-in-out",
            "status": "done",
            "featureKey": "invreports-totalinventoryexportimportreport"
          },
          {
            "label": "حركة تفصيلية للمخازن",
            "icon": "file-text",
            "path": "/reports/inventory/warehouse-movements",
            "status": "done",
            "featureKey": "invreports-inventorytransferdetailsreport"
          },
          {
            "label": "تكاليف / قيمة الاصناف",
            "icon": "file-text",
            "path": "/reports/inventory/item-costs",
            "status": "done",
            "featureKey": "invreports-itemscosts"
          },
          {
            "label": "قائمة الاصناف",
            "icon": "file-text",
            "path": "/reports/inventory/items-list",
            "status": "done",
            "featureKey": "invreports-itemslist"
          },
          {
            "label": "ملخص حركة الاصناف",
            "icon": "file-text",
            "path": "/reports/inventory/item-summary",
            "status": "done",
            "featureKey": "invreports-itemssummary"
          },
          {
            "label": "صادر / وارد صنف",
            "icon": "file-text",
            "path": "/reports/inventory/item-in-out",
            "status": "done",
            "featureKey": "invreports-incomeoutcomeitem"
          },
          {
            "label": "الأصناف الراكدة",
            "icon": "file-text",
            "path": "/reports/inventory/stagnant-items",
            "status": "done",
            "featureKey": "invreports-stagnantitems"
          },
          {
            "label": "أعمار الأصناف",
            "icon": "file-text",
            "path": "/reports/inventory/item-aging",
            "status": "done",
            "featureKey": "invreports-itemaging"
          }
        ]
      },
      {
        "label": "تقارير الحسابات",
        "icon": "book-open",
        "children": [
          {
            "label": "كشف حساب",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-accountstatment",
            "status": "done",
            "featureKey": "accountingreports-accountstatment"
          },
          {
            "label": "كشف حساب عميل",
            "icon": "file-text",
            "path": "/contacts/statement?type=customer",
            "status": "done",
            "featureKey": "accountingreports-customerstatment"
          },
          {
            "label": "كشف حساب مورد",
            "icon": "file-text",
            "path": "/contacts/statement?type=vendor",
            "status": "done",
            "featureKey": "accountingreports-vendorstatment"
          },
          {
            "label": "كشف حساب عميل بالاصناف",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-customeraccountstatementbyitems", "status": "done",
            "featureKey": "accountingreports-customeraccountstatementbyitems"
          },
          {
            "label": "كشف حساب مورد بالاصناف",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-vendoraccountstatementbyitems", "status": "done",
            "featureKey": "accountingreports-vendoraccountstatementbyitems"
          },
          {
            "label": "ارباح الاصناف",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-itemsprofits", "status": "done",
            "featureKey": "accountingreports-itemsprofits"
          },
          {
            "label": "المبيعات بالاصناف",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-grosscustomersalesbyitems", "status": "done",
            "featureKey": "accountingreports-grosscustomersalesbyitems"
          },
          {
            "label": "البيع",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-sales",
            "status": "done",
            "featureKey": "accountingreports-sales"
          },
          {
            "label": "الشراء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-purchases",
            "status": "done",
            "featureKey": "accountingreports-purchases"
          },
          {
            "label": "الشيكات الصادرة",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-checks-checkout", "status": "done",
            "featureKey": "accountingreports-checks-checkout"
          },
          {
            "label": "الشيكات الواردة",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-checks-checkin", "status": "done",
            "featureKey": "accountingreports-checks-checkin"
          },
          {
            "label": "مبيعات المندوبين بالاصناف",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-grossrepsalesbyitems", "status": "done",
            "featureKey": "accountingreports-grossrepsalesbyitems"
          },
          {
            "label": "تحصيلات المندوبين",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-repscollectings", "status": "done",
            "featureKey": "accountingreports-repscollectings"
          },
          {
            "label": "قائمة العملاء",
            "icon": "file-text",
            "path": "/customers",
            "status": "done",
            "featureKey": "accountingreports-customerslist"
          },
          {
            "label": "قائمة الموردين",
            "icon": "file-text",
            "path": "/suppliers",
            "status": "done",
            "featureKey": "accountingreports-vendorslist"
          },
          {
            "label": "كشف حساب مركز تكلفة",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-costcenterstatment", "status": "done",
            "featureKey": "accountingreports-costcenterstatment"
          },
          {
            "label": "اعمار الديون",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-debitsages", "status": "done",
            "featureKey": "accountingreports-debitsages"
          },
          {
            "label": "اعمار الديون سنوي",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-debitsagesbyyear", "status": "done",
            "featureKey": "accountingreports-debitsagesbyyear"
          },
          {
            "label": "اعمار الديون نصف سنوي",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-debitsagesbyhalfyear", "status": "done",
            "featureKey": "accountingreports-debitsagesbyhalfyear"
          },
          {
            "label": "اعمار ديون الموردين",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-creditsages", "status": "done",
            "featureKey": "accountingreports-creditsages"
          },
          {
            "label": "اعمار ديون الموردين سنوي",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-creditsagesbyyear", "status": "done",
            "featureKey": "accountingreports-creditsagesbyyear"
          },
          {
            "label": "اعمار ديون الموردين نصف سنوي",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-creditsagesbyhalfyear", "status": "done",
            "featureKey": "accountingreports-creditsagesbyhalfyear"
          },
          {
            "label": "اوامر الانتاج",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-productionorders", "status": "done",
            "featureKey": "accountingreports-productionorders"
          },
          {
            "label": "فواتير بيع مستحقة",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-matureinvoices", "status": "done",
            "featureKey": "accountingreports-matureinvoices"
          },
          {
            "label": "فواتير شراء مستحقة",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-maturereceipts", "status": "done",
            "featureKey": "accountingreports-maturereceipts"
          },
          {
            "label": "ملخص الاعمال",
            "icon": "file-text",
            "path": "/reports/analytics",
            "status": "done",
            "featureKey": "accountingreports-dashboard"
          },
          {
            "label": "المشتريات بالاصناف",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-grossvendorpurchasesbyitems", "status": "done",
            "featureKey": "accountingreports-grossvendorpurchasesbyitems"
          },
          {
            "label": "طلبات البيع",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-salesorders", "status": "done",
            "featureKey": "accountingreports-salesorders"
          },
          {
            "label": "كشف حساب خزائن",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-accountstatment-cash", "status": "done",
            "featureKey": "accountingreports-accountstatment-cash"
          },
          {
            "label": "ملخص حركة المناطق",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-areassummary", "status": "done",
            "featureKey": "accountingreports-areassummary"
          },
          {
            "label": "ملخص حركة العملاء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-customerssummary", "status": "done",
            "featureKey": "accountingreports-customerssummary"
          },
          {
            "label": "ملخص حركة الموردين",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-vendorssummary", "status": "done",
            "featureKey": "accountingreports-vendorssummary"
          },
          {
            "label": "يومية مندوب",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-repdaily", "status": "done",
            "featureKey": "accountingreports-repdaily"
          },
          {
            "label": "مبيعات الاصناف شهريا بالكميات",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-monthlysalesbyitems", "status": "done",
            "featureKey": "accountingreports-monthlysalesbyitems"
          },
          {
            "label": "مبيعات الاصناف شهريا",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-monthlysalesbyitemstotals", "status": "done",
            "featureKey": "accountingreports-monthlysalesbyitemstotals"
          },
          {
            "label": "مديونية مندوب",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-repdebit", "status": "done",
            "featureKey": "accountingreports-repdebit"
          },
          {
            "label": "اقساط العملاء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-customersinstallments", "status": "done",
            "featureKey": "accountingreports-customersinstallments"
          },
          {
            "label": "خامات وتوالف الانتاج",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-productionmaterials", "status": "done",
            "featureKey": "accountingreports-productionmaterials"
          },
          {
            "label": "ارباح العملاء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-customersprofits", "status": "done",
            "featureKey": "accountingreports-customersprofits"
          },
          {
            "label": "ملخص حركة الفروع",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-branchessummary", "status": "done",
            "featureKey": "accountingreports-branchessummary"
          },
          {
            "label": "معاملات نقدية وبنكية",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-payments", "status": "done",
            "featureKey": "accountingreports-payments"
          },
          {
            "label": "ارباح الفواتير",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-invoiceprofits", "status": "done",
            "featureKey": "accountingreports-invoiceprofits"
          },
          {
            "label": "اخر سعر بيع / شراء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-lastprices", "status": "done",
            "featureKey": "accountingreports-lastprices"
          },
          {
            "label": "المبيعات بالعملاء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-customerssales", "status": "done",
            "featureKey": "accountingreports-customerssales"
          },
          {
            "label": "المشتريات بالموردين",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-vendorspurchases", "status": "done",
            "featureKey": "accountingreports-vendorspurchases"
          },
          {
            "label": "المصروفات شهريا",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-monthlyexpenses", "status": "done",
            "featureKey": "accountingreports-monthlyexpenses"
          },
          {
            "label": "طلبات الشراء",
            "icon": "file-text",
            "path": "/reports/accounting/accountingreports-purchaseorders", "status": "done",
            "featureKey": "accountingreports-purchaseorders"
          }
        ]
      },
      {
        "label": "تقارير شئون الموظفين",
        "icon": "users",
        "children": [
          {
            "label": "حضور وانصراف الموظفين",
            "icon": "file-text",
            "path": "/reports/hr/hrreports-attendance",
            "status": "done",
            "featureKey": "hrreports-attendance"
          },
          {
            "label": "اجازات الموظفين",
            "icon": "file-text",
            "path": "/reports/hr/hrreports-employeesvactions",
            "status": "done",
            "featureKey": "hrreports-employeesvactions"
          },
          {
            "label": "رواتب الموظفين",
            "icon": "file-text",
            "path": "/reports/hr/hrreports-employeespayroll",
            "status": "done",
            "featureKey": "hrreports-employeespayroll"
          },
          {
            "label": "قائمة رواتب الموظفين",
            "icon": "file-text",
            "path": "/reports/hr/hrreports-employeespayroll-list",
            "status": "done",
            "featureKey": "hrreports-employeespayroll-list"
          },
          {
            "label": "موظفين تحت الطلب",
            "icon": "file-text",
            "path": "/reports/hr/hrreports-employeesunderrequest",
            "status": "done",
            "featureKey": "hrreports-employeesunderrequest"
          },
          {
            "label": "قائمة الموظفين",
            "icon": "file-text",
            "path": "/hr/employees",
            "status": "done",
            "featureKey": "hrreports-employeeslist"
          },
          {
            "label": "السلف",
            "icon": "file-text",
            "path": "/reports/hr/hrreports-loans-list",
            "status": "done",
            "featureKey": "hrreports-loans-list"
          }
        ]
      },
      {
        "label": "تقارير الاصول الثابتة",
        "icon": "wrench",
        "children": [
          {
            "label": "اهلاكات الاصول الثابته",
            "icon": "file-text",
            "path": "/reports/assets/fixedassetsreports-dep",
            "status": "done",
            "featureKey": "fixedassetsreports-dep"
          },
          {
            "label": "سجل قيود الإهلاك",
            "icon": "file-text",
            "path": "/reports/assets/fixedassetsreports-depruns",
            "status": "done",
            "featureKey": "fixedassetsreports-depruns"
          },
          {
            "label": "الاصول المباعه",
            "icon": "file-text",
            "path": "/reports/assets/fixedassetsreports-soldfixedassets",
            "status": "done",
            "featureKey": "fixedassetsreports-soldfixedassets"
          }
        ]
      },
      {
        "label": "التقارير الختامية",
        "icon": "pie-chart",
        "children": [
          {
            "label": "دفتر اليومية",
            "icon": "file-text",
            "path": "/reports/final/accounting-generaljournallist",
            "status": "done",
            "featureKey": "accounting-generaljournallist"
          },
          {
            "label": "الاستاذ العام",
            "icon": "file-text",
            "path": "/reports/final/finalreports-generalledger",
            "status": "done",
            "featureKey": "finalreports-generalledger"
          },
          {
            "label": "الاستاذ المساعد",
            "icon": "file-text",
            "path": "/reports/final/finalreports-subledger",
            "status": "done",
            "featureKey": "finalreports-subledger"
          },
          {
            "label": "ميزان المراجعة",
            "icon": "file-text",
            "path": "/reports/final/finalreports-trialbalance",
            "status": "done",
            "featureKey": "finalreports-trialbalance"
          },
          {
            "label": "تكلفة المبيعات",
            "icon": "file-text",
            "path": "/reports/final/finalreports-salescost",
            "status": "done",
            "featureKey": "finalreports-salescost"
          },
          {
            "label": "قائمة الدخل",
            "icon": "file-text",
            "path": "/reports/final/finalreports-incomestatment",
            "status": "done",
            "featureKey": "finalreports-incomestatment"
          },
          {
            "label": "الميزانية العمومية",
            "icon": "file-text",
            "path": "/reports/final/finalreports-balancesheet",
            "status": "done",
            "featureKey": "finalreports-balancesheet"
          },
          {
            "label": "قائمة المركز المالى",
            "icon": "file-text",
            "path": "/reports/final/finalreports-financialstatment",
            "status": "done",
            "featureKey": "finalreports-financialstatment"
          },
          {
            "label": "التدفقات النقدية",
            "icon": "file-text",
            "path": "/reports/final/finalreports-cashflow",
            "status": "done",
            "featureKey": "finalreports-cashflow"
          }
        ]
      }
    ]
  },
  {
    "label": "الصلاحيات",
    "icon": "shield",
    "children": [
      {
        "label": "المستخدمين",
        "icon": "file-text",
        "path": "/settings/users",
        "status": "done",
        "featureKey": "security-users"
      },
      {
        "label": "تعديل بياناتى",
        "icon": "file-text",
        "path": "/profile",
        "status": "done",
        "featureKey": "security-myprofile"
      }
    ]
  },
  {
    "label": "تكليف شحنة",
    "icon": "calculator",
    "path": "/import-costing",
    "status": "done",
    "featureKey": "importcosting-shipments"
  },
  {
    "label": "وارد العمليات",
    "icon": "inbox",
    "children": [
      {
        "label": "وارد واتساب",
        "icon": "message-circle",
        "path": "/ops/whatsapp-inbox",
        "status": "done",
        "featureKey": "ops-whatsapp-inbox"
      },
      {
        "label": "شغل المصنع اليومي",
        "icon": "factory",
        "path": "/ops/factory-daily",
        "status": "done",
        "featureKey": "ops-factory-daily"
      }
    ]
  }
];
export const FEATURE_REGISTRY: Record<string, { label: string; module: string; megaUrl: string; status: FeatureStatus; path: string; }> = {
  "comp-settings": {
    "label": "اعدادات الشركة",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/Settings.aspx?OneUser=1",
    "status": "done",
    "path": "/settings/company"
  },
  "comp-databasebackup": {
    "label": "نسخ احتياطى",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/DatabaseBackup.aspx?OneUser=1",
    "status": "done",
    "path": "/settings/backup"
  },
  "comp-branchs": {
    "label": "الفروع",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/Branchs.aspx",
    "status": "done",
    "path": "/settings/branches"
  },
  "comp-exchangerates": {
    "label": "اسعار العملات",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/ExchangeRates.aspx",
    "status": "done",
    "path": "/settings/exchange-rates"
  },
  "comp-currenctdocs": {
    "label": "المستندات المعلقة",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/CurrenctDocs.aspx",
    "status": "done",
    "path": "/pending-docs"
  },
  "comp-notifications": {
    "label": "التنبيهات",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/Notifications.aspx",
    "status": "done",
    "path": "/notifications"
  },
  "comp-generalattributes": {
    "label": "خصائص عامة",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/GeneralAttributes.aspx",
    "status": "done",
    "path": "/settings/general-attributes"
  },
  "comp-fiscalyearreopen": {
    "label": "فتح فترة مالية سابقة",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/FiscalYearReOpen.aspx?OneUser=1",
    "status": "done",
    "path": "/settings/fiscal-years"
  },
  "comp-fiscalyearclosing": {
    "label": "اغلاق الفترة المالية",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/FiscalYearClosing.aspx?OneUser=1",
    "status": "done",
    "path": "/settings/fiscal-years"
  },
  "comp-usersactivities": {
    "label": "حركات المستخدمين",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/UsersActivities.aspx",
    "status": "done",
    "path": "/settings/user-activities"
  },
  "comp-importdata": {
    "label": "استيراد البيانات",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/ImportData.aspx",
    "status": "done",
    "path": "/settings/import"
  },
  "comp-stat": {
    "label": "احصائيات",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/Stat.aspx",
    "status": "done",
    "path": "/settings/stats"
  },
  "comp-countryandcity": {
    "label": "المدن والمحافاضات",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/CountryAndCity.aspx",
    "status": "done",
    "path": "/settings/cities"
  },
  "comp-addresses": {
    "label": "العناوين",
    "module": "اعدادات عامة",
    "megaUrl": "/Comp/Addresses.aspx",
    "status": "done",
    "path": "/settings/addresses"
  },
  "contacts-contactscategories": {
    "label": "فئات العملاء / الموردين",
    "module": "العملاء والموردين",
    "megaUrl": "/Contacts/ContactsCategories.aspx",
    "status": "done",
    "path": "/contact-categories"
  },
  "contacts-customers": {
    "label": "عميل",
    "module": "العملاء والموردين",
    "megaUrl": "/Contacts/Customers.aspx",
    "status": "done",
    "path": "/customers"
  },
  "contacts-customerslist": {
    "label": "قائمة العملاء",
    "module": "العملاء والموردين",
    "megaUrl": "/Contacts/CustomersList.aspx",
    "status": "done",
    "path": "/customers"
  },
  "contacts-vendors": {
    "label": "مورد",
    "module": "العملاء والموردين",
    "megaUrl": "/Contacts/Vendors.aspx",
    "status": "done",
    "path": "/suppliers"
  },
  "contacts-vendorslist": {
    "label": "قائمة الموردين",
    "module": "العملاء والموردين",
    "megaUrl": "/Contacts/VendorsList.aspx",
    "status": "done",
    "path": "/suppliers"
  },
  "hr-departments": {
    "label": "الادارات",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Departments.aspx",
    "status": "done",
    "path": "/hr/departments"
  },
  "hr-positions": {
    "label": "الوظائف",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Positions.aspx",
    "status": "done",
    "path": "/hr/jobs"
  },
  "hr-shifts": {
    "label": "فترات العمل",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Shifts.aspx",
    "status": "done",
    "path": "/hr/shifts"
  },
  "hr-vacations": {
    "label": "الاجازات",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Vacations.aspx",
    "status": "done",
    "path": "/hr/vacations"
  },
  "hr-employee-vacations": {
    "label": "طلبات إجازات الموظفين",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/EmployeeVacations.aspx",
    "status": "done",
    "path": "/hr/employee-vacations"
  },
  "hr-employeeshifts": {
    "label": "نظام الورديات",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/EmployeeShifts.aspx",
    "status": "done",
    "path": "/hr/employee-shifts"
  },
  "hr-incentives": {
    "label": "الحوافز",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Incentives.aspx",
    "status": "done",
    "path": "/hr/incentives"
  },
  "hr-underrequestemployees": {
    "label": "موظفين تحت الطلب",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/UnderRequestEmployees.aspx",
    "status": "done",
    "path": "/hr/under-request"
  },
  "hr-underrequestemployeeslist": {
    "label": "قائمة موظفين تحت الطلب",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/UnderRequestEmployeesList.aspx",
    "status": "done",
    "path": "/hr/under-request"
  },
  "hr-employees": {
    "label": "الموظفين",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Employees.aspx",
    "status": "done",
    "path": "/hr/employees"
  },
  "hr-employeeslist": {
    "label": "قائمة الموظفين",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/EmployeesList.aspx",
    "status": "done",
    "path": "/hr/employees"
  },
  "hr-machines": {
    "label": "ماكينات البصمة",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Machines.aspx",
    "status": "done",
    "path": "/hr/machines"
  },
  "hr-mobileattendance": {
    "label": "بصمة من الموبايل",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/MobileAttendance.aspx",
    "status": "done",
    "path": "/hr/mobile-attendance"
  },
  "hr-mobilefplocations": {
    "label": "مواقع بصمة الموبايل",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/MobileFPLocations.aspx",
    "status": "done",
    "path": "/hr/mobile-locations"
  },
  "hr-machineattendance": {
    "label": "الحضور والانصراف من الماكينة",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/MachineAttendance.aspx",
    "status": "done",
    "path": "/hr/machine-attendance"
  },
  "hr-attendance": {
    "label": "الحضور والانصراف",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Attendance.aspx",
    "status": "done",
    "path": "/hr/attendance"
  },
  "hr-systems": {
    "label": "الانظمة",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Systems.aspx",
    "status": "done",
    "path": "/hr/systems"
  },
  "hr-depempsystems": {
    "label": "انظمة الاقسام /الموظفين",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/DepEmpSystems.aspx",
    "status": "done",
    "path": "/hr/dep-emp-systems"
  },
  "hr-loans": {
    "label": "السلف",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Loans.aspx?Branch_ID={0}",
    "status": "done",
    "path": "/hr/advances"
  },
  "hr-payroll": {
    "label": "حساب الرواتب",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/Payroll.aspx",
    "status": "done",
    "path": "/hr/payroll"
  },
  "hr-payrollpayment": {
    "label": "صرف الرواتب",
    "module": "شئون الموظفين",
    "megaUrl": "/HR/PayrollPayment.aspx",
    "status": "done",
    "path": "/hr/payroll"
  },
  "inv-stores": {
    "label": "المخازن",
    "module": "المخازن",
    "megaUrl": "/Inv/Stores.aspx",
    "status": "done",
    "path": "/inventory/warehouses"
  },
  "inv-categories": {
    "label": "فئات الاصناف",
    "module": "المخازن",
    "megaUrl": "/Inv/Categories.aspx",
    "status": "done",
    "path": "/inventory/categories"
  },
  "inv-items": {
    "label": "صنف",
    "module": "المخازن",
    "megaUrl": "/Inv/Items.aspx",
    "status": "done",
    "path": "/items/new"
  },
  "inv-itemslist": {
    "label": "قائمة الاصناف",
    "module": "المخازن",
    "megaUrl": "/Inv/ItemsList.aspx",
    "status": "done",
    "path": "/items"
  },
  "inv-inventorycorrection": {
    "label": "تسوية مخزنية",
    "module": "المخازن",
    "megaUrl": "/Inv/InventoryCorrection.aspx",
    "status": "done",
    "path": "/inventory/adjustments"
  },
  "inv-inventorydocumentslist-invcorr": {
    "label": "قائمة التسويات المخزنية",
    "module": "المخازن",
    "megaUrl": "/Inv/InventoryDocumentsList.aspx/InvCorr",
    "status": "done",
    "path": "/inventory/adjustments"
  },
  "inv-inventorytransfer": {
    "label": "تحويل مخزني",
    "module": "المخازن",
    "megaUrl": "/Inv/InventoryTransfer.aspx",
    "status": "done",
    "path": "/inventory/transfers"
  },
  "inv-inventorydocumentslist-invtrans": {
    "label": "قائمة التحويلات المخزنية",
    "module": "المخازن",
    "megaUrl": "/Inv/InventoryDocumentsList.aspx/InvTrans",
    "status": "done",
    "path": "/inventory/transfers"
  },
  "inv-begininginventory": {
    "label": "مخزون اول المدة",
    "module": "المخازن",
    "megaUrl": "/Inv/BeginingInventory.aspx?OneUser=1",
    "status": "done",
    "path": "/inventory/beginning-inventory"
  },
  "inv-mega-report-import": {
    "label": "استيراد تقارير Excel",
    "module": "المخازن",
    "megaUrl": "",
    "status": "done",
    "path": "/inventory/mega-report-import"
  },
  "inv-pricechanger": {
    "label": "تغيير الاسعار",
    "module": "المخازن",
    "megaUrl": "/Inv/PriceChanger.aspx",
    "status": "done",
    "path": "/inventory/price-changer"
  },
  "inv-itemsbatches": {
    "label": "ارقام التشغيلة",
    "module": "المخازن",
    "megaUrl": "/Inv/ItemsBatches.aspx",
    "status": "done",
    "path": "/inventory/batches"
  },
  "inv-itemserials": {
    "label": "الأرقام التسلسلية",
    "module": "المخازن",
    "megaUrl": "/Inv/ItemSerials.aspx",
    "status": "done",
    "path": "/inventory/serials"
  },
  "inv-offers": {
    "label": "العروض",
    "module": "المخازن",
    "megaUrl": "/Inv/Offers.aspx",
    "status": "done",
    "path": "/inventory/offers"
  },
  "purchases-purchaseorder": {
    "label": "طلب شراء",
    "module": "فواتير الشراء",
    "megaUrl": "/Purchases/PurchaseOrder.aspx",
    "status": "done",
    "path": "/purchases/orders"
  },
  "purchases-receiptslist-purchaseorder": {
    "label": "قائمة طلبات الشراء",
    "module": "فواتير الشراء",
    "megaUrl": "/Purchases/ReceiptsList.aspx/PurchaseOrder",
    "status": "done",
    "path": "/purchases/orders"
  },
  "purchases-receipt": {
    "label": "فاتورة شراء",
    "module": "فواتير الشراء",
    "megaUrl": "/Purchases/Receipt.aspx",
    "status": "done",
    "path": "/purchases/invoices"
  },
  "purchases-receiptslist-receipt": {
    "label": "قائمة فواتير الشراء",
    "module": "فواتير الشراء",
    "megaUrl": "/Purchases/ReceiptsList.aspx/Receipt",
    "status": "done",
    "path": "/purchases/invoices"
  },
  "purchases-returnreceipt": {
    "label": "فاتورة مردود شراء",
    "module": "فواتير الشراء",
    "megaUrl": "/Purchases/ReturnReceipt.aspx",
    "status": "done",
    "path": "/purchases/returns"
  },
  "purchases-returnreceiptslist": {
    "label": "قائمة فواتير مردود شراء",
    "module": "فواتير الشراء",
    "megaUrl": "/Purchases/ReturnReceiptsList.aspx",
    "status": "done",
    "path": "/purchases/returns"
  },
  "sales-salesorder": {
    "label": "طلب بيع",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/SalesOrder.aspx",
    "status": "done",
    "path": "/sales/orders"
  },
  "sales-invoiceslist-salesorder": {
    "label": "قائمة طلبات البيع",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/InvoicesList.aspx/SalesOrder",
    "status": "done",
    "path": "/sales/orders"
  },
  "sales-invoice-cash": {
    "label": "فاتورة مبيعات نقدية",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/Invoice.aspx/Cash",
    "status": "done",
    "path": "/sales/invoices?mode=cash"
  },
  "sales-invoice": {
    "label": "فاتورة بيع",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/Invoice.aspx",
    "status": "done",
    "path": "/sales/invoices"
  },
  "sales-invoiceslist-invoice": {
    "label": "قائمة فواتير البيع",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/InvoicesList.aspx/Invoice",
    "status": "done",
    "path": "/sales/invoices"
  },
  "sales-returninvoice": {
    "label": "فاتورة مردود بيع",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/ReturnInvoice.aspx",
    "status": "done",
    "path": "/sales/returns"
  },
  "sales-returninvoiceslist": {
    "label": "قائمة فواتير مردود بيع",
    "module": "فواتير المبيعات",
    "megaUrl": "/Sales/ReturnInvoicesList.aspx",
    "status": "done",
    "path": "/sales/returns"
  },
  "reps-areas": {
    "label": "مناطق البيع",
    "module": "مندوبين البيع",
    "megaUrl": "/Reps/Areas.aspx",
    "status": "done",
    "path": "/sales/areas"
  },
  "reps-salesrep": {
    "label": "مناديب البيع",
    "module": "مندوبين البيع",
    "megaUrl": "/Reps/SalesRep.aspx",
    "status": "done",
    "path": "/sales/reps"
  },
  "payments-payments-cashin": {
    "label": "استلام نقدية",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/Payments.aspx/CashIn",
    "status": "done",
    "path": "/cash/receive"
  },
  "payments-paymentslist-cashin": {
    "label": "قائمة استلام النقدية",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/PaymentsList.aspx/CashIn",
    "status": "done",
    "path": "/cash/receive"
  },
  "payments-payments-cashincustomer": {
    "label": "استلام نقدية من عميل",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/Payments.aspx/CashInCustomer",
    "status": "done",
    "path": "/cash/receive-customer"
  },
  "payments-paymentslist-cashincustomer": {
    "label": "قائمة استلام نقدية من عميل",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/PaymentsList.aspx/CashInCustomer",
    "status": "done",
    "path": "/cash/receive-customer"
  },
  "payments-payments-cashout": {
    "label": "صرف نقدية",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/Payments.aspx/CashOut",
    "status": "done",
    "path": "/cash/pay"
  },
  "payments-payments-cashoutcustomer": {
    "label": "صرف نقدية لعميل",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/Payments.aspx/CashOutCustomer",
    "status": "done",
    "path": "/cash/pay-customer"
  },
  "payments-paymentslist-cashout": {
    "label": "قائمة صرف نقدية",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/PaymentsList.aspx/CashOut",
    "status": "done",
    "path": "/cash/pay"
  },
  "payments-payments-cashoutvendor": {
    "label": "صرف نقدية لمورد",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/Payments.aspx/CashOutVendor",
    "status": "done",
    "path": "/cash/pay-supplier"
  },
  "payments-paymentslist-cashoutvendor": {
    "label": "قائمة صرف نقدية لمورد",
    "module": "معاملات نقدية",
    "megaUrl": "/Payments/PaymentsList.aspx/CashOutVendor",
    "status": "done",
    "path": "/cash/pay-supplier"
  },
  "payments-payments-bankdeposit": {
    "label": "ايداع بنكى",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Payments.aspx/BankDeposit",
    "status": "done",
    "path": "/bank/transactions?type=deposit"
  },
  "payments-paymentslist-bankdeposit": {
    "label": "قائمة ايداع بنكى",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/PaymentsList.aspx/BankDeposit",
    "status": "done",
    "path": "/bank/transactions?type=deposit"
  },
  "payments-payments-bankdepositcustomer": {
    "label": "ايداع بنكى من عميل",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Payments.aspx/BankDepositCustomer",
    "status": "done",
    "path": "/bank/transactions?type=deposit-customer"
  },
  "payments-paymentslist-bankdepositcustomer": {
    "label": "قائمة ايداع بنكى من عميل",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/PaymentsList.aspx/BankDepositCustomer",
    "status": "done",
    "path": "/bank/transactions?type=deposit-customer"
  },
  "payments-payments-bankwithdraw": {
    "label": "سحب بنكى",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Payments.aspx/BankWithdraw",
    "status": "done",
    "path": "/bank/transactions?type=withdraw"
  },
  "payments-payments-bankwithdrawcustomer": {
    "label": "سحب بنكى لعميل",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Payments.aspx/BankWithdrawCustomer",
    "status": "done",
    "path": "/bank/transactions?type=withdraw-customer"
  },
  "payments-paymentslist-bankwithdraw": {
    "label": "قائمة سحب بنكى",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/PaymentsList.aspx/BankWithdraw",
    "status": "done",
    "path": "/bank/transactions?type=withdraw"
  },
  "payments-payments-bankwithdrawvendor": {
    "label": "سحب بنكى لمورد",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Payments.aspx/BankWithdrawVendor",
    "status": "done",
    "path": "/bank/transactions?type=withdraw-vendor"
  },
  "payments-paymentslist-bankwithdrawvendor": {
    "label": "قائمة سحب بنكى لمورد",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/PaymentsList.aspx/BankWithdrawVendor",
    "status": "done",
    "path": "/bank/transactions?type=withdraw-vendor"
  },
  "payments-checks-checkin": {
    "label": "شيك وارد",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Checks.aspx/CheckIn",
    "status": "done",
    "path": "/bank/checks?type=in"
  },
  "payments-checkslist-checkin": {
    "label": "قائمة الشيكات الواردة",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/ChecksList.aspx/CheckIn",
    "status": "done",
    "path": "/bank/checks?type=in"
  },
  "payments-checks-routing": {
    "label": "توجيه الشيكات",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/CheckRouting",
    "status": "done",
    "path": "/bank/check-routing"
  },
  "payments-checks-checkout": {
    "label": "شيك صادر",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/Checks.aspx/CheckOut",
    "status": "done",
    "path": "/bank/checks?type=out"
  },
  "payments-checkslist-checkout": {
    "label": "قائمة الشيكات الصادرة",
    "module": "معاملات بنكية",
    "megaUrl": "/Payments/ChecksList.aspx/CheckOut",
    "status": "done",
    "path": "/bank/checks?type=out"
  },
  "accounting-chartofaccounts": {
    "label": "شجرة الحسابات",
    "module": "الحسابات",
    "megaUrl": "/Accounting/ChartOfAccounts.aspx",
    "status": "done",
    "path": "/accounts/chart"
  },
  "accounting-taxes": {
    "label": "الضرائب",
    "module": "الحسابات",
    "megaUrl": "/Accounting/Taxes.aspx",
    "status": "done",
    "path": "/reports/tax"
  },
  "accounting-journalentry": {
    "label": "قيد يومية",
    "module": "الحسابات",
    "megaUrl": "/Accounting/JournalEntry.aspx",
    "status": "done",
    "path": "/accounts/journal"
  },
  "accounting-journalentrieslist": {
    "label": "قائمة قيود اليومية",
    "module": "الحسابات",
    "megaUrl": "/Accounting/JournalEntriesList.aspx",
    "status": "done",
    "path": "/accounts/journal"
  },
  "accounting-moneytransfer": {
    "label": "تحويل اموال",
    "module": "الحسابات",
    "megaUrl": "/Accounting/MoneyTransfer.aspx",
    "status": "done",
    "path": "/accounts/transfer"
  },
  "accounting-moneytransferlist": {
    "label": "قائمة تحويل الاموال",
    "module": "الحسابات",
    "megaUrl": "/Accounting/MoneyTransferList.aspx",
    "status": "done",
    "path": "/accounts/transfer"
  },
  "fixedassets-categories": {
    "label": "فئات الاصول",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/Categories.aspx",
    "status": "done",
    "path": "/assets/categories"
  },
  "fixedassets-assets": {
    "label": "الاصول",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/Assets.aspx",
    "status": "done",
    "path": "/assets"
  },
  "fixedassets-assetslist": {
    "label": "قائمة الاصول",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/AssetsList.aspx",
    "status": "done",
    "path": "/assets"
  },
  "fixedassets-capitalmaintain": {
    "label": "الصيانة الراسمالية",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/CapitalMaintain.aspx",
    "status": "done",
    "path": "/assets/capital-maintenance"
  },
  "fixedassets-capitalmaintainlist": {
    "label": "قائمة الصيانة الراسمالية",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/CapitalMaintainList.aspx",
    "status": "done",
    "path": "/assets/capital-maintenance-list"
  },
  "fixedassets-assetsselling": {
    "label": "بيع الاصول",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/AssetsSelling.aspx",
    "status": "done",
    "path": "/assets/selling"
  },
  "fixedassets-assetssellinglist": {
    "label": "قائمة بيع الاصول",
    "module": "الاصول الثابته",
    "megaUrl": "/FixedAssets/AssetsSellingList.aspx",
    "status": "done",
    "path": "/assets/selling-list"
  },
  "production-productionorder": {
    "label": "امر انتاج",
    "module": "الانتاج",
    "megaUrl": "/Production/ProductionOrder.aspx",
    "status": "done",
    "path": "/production?tab=new"
  },
  "production-productionorderslist": {
    "label": "قائمة اوامر الانتاج",
    "module": "الانتاج",
    "megaUrl": "/Production/ProductionOrdersList.aspx",
    "status": "done",
    "path": "/production?tab=orders"
  },
  "costcenters-costcenters": {
    "label": "مراكز التكلفة",
    "module": "مراكز التكلفة",
    "megaUrl": "/CostCenters/CostCenters.aspx",
    "status": "done",
    "path": "/cost-centers"
  },
  "loans-loan": {
    "label": "قرض",
    "module": "القروض",
    "megaUrl": "/Loans/Loan.aspx",
    "status": "done",
    "path": "/loans"
  },
  "loans-loanslist": {
    "label": "قائمة القروض",
    "module": "القروض",
    "megaUrl": "/Loans/LoansList.aspx",
    "status": "done",
    "path": "/loans"
  },
  "installments-installment": {
    "label": "قسط",
    "module": "الاقساط",
    "megaUrl": "/Installments/Installment.aspx",
    "status": "done",
    "path": "/installments"
  },
  "installments-installmentslist": {
    "label": "قائمة الاقساط",
    "module": "الاقساط",
    "megaUrl": "/Installments/InstallmentsList.aspx",
    "status": "done",
    "path": "/installments"
  },
  "invreports-inventorysummary": {
    "label": "جرد المخازن",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/InventorySummary.aspx",
    "status": "done",
    "path": "/reports/inventory/stocktake"
  },
  "invreports-itemstransferdetails": {
    "label": "حركة تفصيلية للاصناف",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/ItemsTransferDetails.aspx",
    "status": "done",
    "path": "/reports/inventory/item-movements"
  },
  "invreports-totalinventoryexportimportreport": {
    "label": "صادر / وارد مخزن",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/TotalInventoryExportImportReport.aspx",
    "status": "done",
    "path": "/reports/inventory/warehouse-in-out"
  },
  "invreports-inventorytransferdetailsreport": {
    "label": "حركة تفصيلية للمخازن",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/InventoryTransferDetailsReport.aspx",
    "status": "done",
    "path": "/reports/inventory/warehouse-movements"
  },
  "invreports-itemscosts": {
    "label": "تكاليف / قيمة الاصناف",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/ItemsCosts.aspx",
    "status": "done",
    "path": "/reports/inventory/item-costs"
  },
  "invreports-itemslist": {
    "label": "قائمة الاصناف",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/ItemsList.aspx",
    "status": "done",
    "path": "/reports/inventory/items-list"
  },
  "invreports-itemssummary": {
    "label": "ملخص حركة الاصناف",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/ItemsSummary.aspx",
    "status": "done",
    "path": "/reports/inventory/item-summary"
  },
  "invreports-incomeoutcomeitem": {
    "label": "صادر / وارد صنف",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/IncomeOutcomeItem.aspx",
    "status": "done",
    "path": "/reports/inventory/item-in-out"
  },
  "invreports-stagnantitems": {
    "label": "الأصناف الراكدة",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/StagnantItems.aspx",
    "status": "done",
    "path": "/reports/inventory/stagnant-items"
  },
  "invreports-itemaging": {
    "label": "أعمار الأصناف",
    "module": "تقارير المخازن",
    "megaUrl": "/InvReports/ItemAging.aspx",
    "status": "done",
    "path": "/reports/inventory/item-aging"
  },
  "accountingreports-accountstatment": {
    "label": "كشف حساب",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/AccountStatment.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-accountstatment"
  },
  "accountingreports-customerstatment": {
    "label": "كشف حساب عميل",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomerStatment.aspx",
    "status": "done",
    "path": "/contacts/statement?type=customer"
  },
  "accountingreports-vendorstatment": {
    "label": "كشف حساب مورد",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/VendorStatment.aspx",
    "status": "done",
    "path": "/contacts/statement?type=vendor"
  },
  "accountingreports-customeraccountstatementbyitems": {
    "label": "كشف حساب عميل بالاصناف",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomerAccountStatementByItems.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-customeraccountstatementbyitems"
  },
  "accountingreports-vendoraccountstatementbyitems": {
    "label": "كشف حساب مورد بالاصناف",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/VendorAccountStatementByItems.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-vendoraccountstatementbyitems"
  },
  "accountingreports-itemsprofits": {
    "label": "ارباح الاصناف",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/ItemsProfits.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-itemsprofits"
  },
  "accountingreports-grosscustomersalesbyitems": {
    "label": "المبيعات بالاصناف",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/GrossCustomerSalesByItems.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-grosscustomersalesbyitems"
  },
  "accountingreports-sales": {
    "label": "البيع",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/Sales.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-sales"
  },
  "accountingreports-purchases": {
    "label": "الشراء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/Purchases.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-purchases"
  },
  "accountingreports-checks-checkout": {
    "label": "الشيكات الصادرة",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/Checks.aspx/CheckOut",
    "status": "done",
    "path": "/reports/accounting/accountingreports-checks-checkout"
  },
  "accountingreports-checks-checkin": {
    "label": "الشيكات الواردة",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/Checks.aspx/CheckIn",
    "status": "done",
    "path": "/reports/accounting/accountingreports-checks-checkin"
  },
  "accountingreports-grossrepsalesbyitems": {
    "label": "مبيعات المندوبين بالاصناف",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/GrossRepSalesByItems.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-grossrepsalesbyitems"
  },
  "accountingreports-repscollectings": {
    "label": "تحصيلات المندوبين",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/RepsCollectings.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-repscollectings"
  },
  "accountingreports-customerslist": {
    "label": "قائمة العملاء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomersList.aspx",
    "status": "done",
    "path": "/customers"
  },
  "accountingreports-vendorslist": {
    "label": "قائمة الموردين",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/VendorsList.aspx",
    "status": "done",
    "path": "/suppliers"
  },
  "accountingreports-costcenterstatment": {
    "label": "كشف حساب مركز تكلفة",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CostCenterStatment.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-costcenterstatment"
  },
  "accountingreports-debitsages": {
    "label": "اعمار الديون",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/DebitsAges.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-debitsages"
  },
  "accountingreports-debitsagesbyyear": {
    "label": "اعمار الديون سنوي",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/DebitsAgesByYear.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-debitsagesbyyear"
  },
  "accountingreports-debitsagesbyhalfyear": {
    "label": "اعمار الديون نصف سنوي",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/DebitsAgesByHalfYear.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-debitsagesbyhalfyear"
  },
  "accountingreports-creditsages": {
    "label": "اعمار ديون الموردين",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CreditsAges.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-creditsages"
  },
  "accountingreports-creditsagesbyyear": {
    "label": "اعمار ديون الموردين سنوي",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CreditsAgesByYear.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-creditsagesbyyear"
  },
  "accountingreports-creditsagesbyhalfyear": {
    "label": "اعمار ديون الموردين نصف سنوي",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CreditsAgesByHalfYear.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-creditsagesbyhalfyear"
  },
  "accountingreports-productionorders": {
    "label": "اوامر الانتاج",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/ProductionOrders.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-productionorders"
  },
  "accountingreports-matureinvoices": {
    "label": "فواتير بيع مستحقة",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/MatureInvoices.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-matureinvoices"
  },
  "accountingreports-maturereceipts": {
    "label": "فواتير شراء مستحقة",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/MatureReceipts.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-maturereceipts"
  },
  "accountingreports-dashboard": {
    "label": "ملخص الاعمال",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/Dashboard.aspx",
    "status": "done",
    "path": "/reports/analytics"
  },
  "accountingreports-grossvendorpurchasesbyitems": {
    "label": "المشتريات بالاصناف",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/GrossVendorPurchasesByItems.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-grossvendorpurchasesbyitems"
  },
  "accountingreports-salesorders": {
    "label": "طلبات البيع",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/SalesOrders.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-salesorders"
  },
  "accountingreports-accountstatment-cash": {
    "label": "كشف حساب خزائن",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/AccountStatment.aspx/Cash",
    "status": "done",
    "path": "/reports/accounting/accountingreports-accountstatment-cash"
  },
  "accountingreports-areassummary": {
    "label": "ملخص حركة المناطق",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/AreasSummary.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-areassummary"
  },
  "accountingreports-customerssummary": {
    "label": "ملخص حركة العملاء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomersSummary.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-customerssummary"
  },
  "accountingreports-vendorssummary": {
    "label": "ملخص حركة الموردين",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/VendorsSummary.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-vendorssummary"
  },
  "accountingreports-repdaily": {
    "label": "يومية مندوب",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/RepDaily.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-repdaily"
  },
  "accountingreports-monthlysalesbyitems": {
    "label": "مبيعات الاصناف شهريا بالكميات",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/MonthlySalesByItems.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-monthlysalesbyitems"
  },
  "accountingreports-monthlysalesbyitemstotals": {
    "label": "مبيعات الاصناف شهريا",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/MonthlySalesByItemsTotals.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-monthlysalesbyitemstotals"
  },
  "accountingreports-repdebit": {
    "label": "مديونية مندوب",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/RepDebit.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-repdebit"
  },
  "accountingreports-customersinstallments": {
    "label": "اقساط العملاء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomersInstallments.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-customersinstallments"
  },
  "accountingreports-productionmaterials": {
    "label": "خامات وتوالف الانتاج",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/ProductionMaterials.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-productionmaterials"
  },
  "accountingreports-customersprofits": {
    "label": "ارباح العملاء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomersProfits.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-customersprofits"
  },
  "accountingreports-branchessummary": {
    "label": "ملخص حركة الفروع",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/BranchesSummary.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-branchessummary"
  },
  "accountingreports-payments": {
    "label": "معاملات نقدية وبنكية",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/Payments.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-payments"
  },
  "accountingreports-invoiceprofits": {
    "label": "ارباح الفواتير",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/InvoiceProfits.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-invoiceprofits"
  },
  "accountingreports-lastprices": {
    "label": "اخر سعر بيع / شراء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/LastPrices.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-lastprices"
  },
  "accountingreports-customerssales": {
    "label": "المبيعات بالعملاء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/CustomersSales.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-customerssales"
  },
  "accountingreports-vendorspurchases": {
    "label": "المشتريات بالموردين",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/VendorsPurchases.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-vendorspurchases"
  },
  "accountingreports-monthlyexpenses": {
    "label": "المصروفات شهريا",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/MonthlyExpenses.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-monthlyexpenses"
  },
  "accountingreports-purchaseorders": {
    "label": "طلبات الشراء",
    "module": "تقارير الحسابات",
    "megaUrl": "/AccountingReports/PurchaseOrders.aspx",
    "status": "done",
    "path": "/reports/accounting/accountingreports-purchaseorders"
  },
  "hrreports-attendance": {
    "label": "حضور وانصراف الموظفين",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/Attendance.aspx",
    "status": "done",
    "path": "/reports/hr/hrreports-attendance"
  },
  "hrreports-employeesvactions": {
    "label": "اجازات الموظفين",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/EmployeesVactions.aspx",
    "status": "done",
    "path": "/reports/hr/hrreports-employeesvactions"
  },
  "hrreports-employeespayroll": {
    "label": "رواتب الموظفين",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/EmployeesPayroll.aspx",
    "status": "done",
    "path": "/reports/hr/hrreports-employeespayroll"
  },
  "hrreports-employeespayroll-list": {
    "label": "قائمة رواتب الموظفين",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/EmployeesPayroll.aspx/List",
    "status": "done",
    "path": "/reports/hr/hrreports-employeespayroll-list"
  },
  "hrreports-employeesunderrequest": {
    "label": "موظفين تحت الطلب",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/EmployeesUnderRequest.aspx",
    "status": "done",
    "path": "/reports/hr/hrreports-employeesunderrequest"
  },
  "hrreports-employeeslist": {
    "label": "قائمة الموظفين",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/EmployeesList.aspx",
    "status": "done",
    "path": "/hr/employees"
  },
  "hrreports-loans-list": {
    "label": "السلف",
    "module": "تقارير شئون الموظفين",
    "megaUrl": "/HRReports/Loans.aspx/List",
    "status": "done",
    "path": "/reports/hr/hrreports-loans-list"
  },
  "fixedassetsreports-dep": {
    "label": "اهلاكات الاصول الثابته",
    "module": "تقارير الاصول الثابتة",
    "megaUrl": "/FixedAssetsReports/Dep.aspx",
    "status": "done",
    "path": "/reports/assets/fixedassetsreports-dep"
  },
  "fixedassetsreports-depruns": {
    "label": "سجل قيود الإهلاك",
    "module": "تقارير الاصول الثابتة",
    "megaUrl": "/FixedAssetsReports/Dep.aspx",
    "status": "done",
    "path": "/reports/assets/fixedassetsreports-depruns"
  },
  "fixedassetsreports-soldfixedassets": {
    "label": "الاصول المباعه",
    "module": "تقارير الاصول الثابتة",
    "megaUrl": "/FixedAssetsReports/SoldFixedAssets.aspx",
    "status": "done",
    "path": "/reports/assets/fixedassetsreports-soldfixedassets"
  },
  "accounting-generaljournallist": {
    "label": "دفتر اليومية",
    "module": "التقارير الختامية",
    "megaUrl": "/Accounting/GeneralJournalList.aspx",
    "status": "done",
    "path": "/reports/final/accounting-generaljournallist"
  },
  "finalreports-generalledger": {
    "label": "الاستاذ العام",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/GeneralLedger.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-generalledger"
  },
  "finalreports-subledger": {
    "label": "الاستاذ المساعد",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/SubLedger.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-subledger"
  },
  "finalreports-trialbalance": {
    "label": "ميزان المراجعة",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/TrialBalance.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-trialbalance"
  },
  "finalreports-salescost": {
    "label": "تكلفة المبيعات",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/SalesCost.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-salescost"
  },
  "finalreports-incomestatment": {
    "label": "قائمة الدخل",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/IncomeStatment.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-incomestatment"
  },
  "finalreports-balancesheet": {
    "label": "الميزانية العمومية",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/BalanceSheet.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-balancesheet"
  },
  "finalreports-financialstatment": {
    "label": "قائمة المركز المالى",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/FinancialStatment.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-financialstatment"
  },
  "finalreports-cashflow": {
    "label": "التدفقات النقدية",
    "module": "التقارير الختامية",
    "megaUrl": "/FinalReports/CashFlow.aspx",
    "status": "done",
    "path": "/reports/final/finalreports-cashflow"
  },
  "security-users": {
    "label": "المستخدمين",
    "module": "الصلاحيات",
    "megaUrl": "/Security/Users.aspx",
    "status": "done",
    "path": "/settings/users"
  },
  "security-myprofile": {
    "label": "تعديل بياناتى",
    "module": "الصلاحيات",
    "megaUrl": "/Security/MyProfile.aspx",
    "status": "done",
    "path": "/profile"
  },
  "support": {
    "label": "الدعم الفني",
    "module": "الدعم",
    "megaUrl": "/Support/Default.aspx",
    "status": "done",
    "path": "/support"
  },
  "importcosting-shipments": {
    "label": "تكليف شحنة",
    "module": "تكليف شحنة",
    "megaUrl": "",
    "status": "done",
    "path": "/import-costing"
  },
  "ops-whatsapp-inbox": {
    "label": "وارد واتساب",
    "module": "وارد العمليات",
    "megaUrl": "",
    "status": "done",
    "path": "/ops/whatsapp-inbox"
  },
  "ops-factory-daily": {
    "label": "شغل المصنع اليومي",
    "module": "وارد العمليات",
    "megaUrl": "",
    "status": "done",
    "path": "/ops/factory-daily"
  }
};
export const NAV_STATS = { done: 178, partial: 0, missing: 0 } as const;
