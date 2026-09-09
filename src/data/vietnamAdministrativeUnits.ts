import { VIETNAM_PROVINCES_64 } from './vietnamProvinceOptions';

// Dữ liệu phường/xã được giữ để tương thích dữ liệu đã có.
export interface VietnamAdministrativeWard {
  id: string;
  label: string;
}

export interface VietnamAdministrativeProvince {
  id: string;
  label: string;
  wards: VietnamAdministrativeWard[];
}

const POST_2025_ADMINISTRATIVE_UNITS: VietnamAdministrativeProvince[] = [
  {
    "id": "an_giang",
    "label": "An Giang",
    "wards": [
      {
        "id": "ward_31108",
        "label": "Đặc khu Kiên Hải"
      },
      {
        "id": "ward_31078",
        "label": "Đặc khu Phú Quốc"
      },
      {
        "id": "ward_31105",
        "label": "Đặc khu Thổ Châu"
      },
      {
        "id": "ward_30292",
        "label": "Phường Bình Đức"
      },
      {
        "id": "ward_30316",
        "label": "Phường Châu Đốc"
      },
      {
        "id": "ward_30505",
        "label": "Phường Chi Lăng"
      },
      {
        "id": "ward_30769",
        "label": "Phường Hà Tiên"
      },
      {
        "id": "ward_30377",
        "label": "Phường Long Phú"
      },
      {
        "id": "ward_30307",
        "label": "Phường Long Xuyên"
      },
      {
        "id": "ward_30301",
        "label": "Phường Mỹ Thới"
      },
      {
        "id": "ward_30742",
        "label": "Phường Rạch Giá"
      },
      {
        "id": "ward_30376",
        "label": "Phường Tân Châu"
      },
      {
        "id": "ward_30502",
        "label": "Phường Thới Sơn"
      },
      {
        "id": "ward_30520",
        "label": "Phường Tịnh Biên"
      },
      {
        "id": "ward_30766",
        "label": "Phường Tô Châu"
      },
      {
        "id": "ward_30325",
        "label": "Phường Vĩnh Tế"
      },
      {
        "id": "ward_30760",
        "label": "Phường Vĩnh Thông"
      },
      {
        "id": "ward_30985",
        "label": "Xã An Biên"
      },
      {
        "id": "ward_30589",
        "label": "Xã An Châu"
      },
      {
        "id": "ward_30526",
        "label": "Xã An Cư"
      },
      {
        "id": "ward_31018",
        "label": "Xã An Minh"
      },
      {
        "id": "ward_30337",
        "label": "Xã An Phú"
      },
      {
        "id": "ward_30547",
        "label": "Xã Ba Chúc"
      },
      {
        "id": "ward_30898",
        "label": "Xã Bình An"
      },
      {
        "id": "ward_30826",
        "label": "Xã Bình Giang"
      },
      {
        "id": "ward_30607",
        "label": "Xã Bình Hòa"
      },
      {
        "id": "ward_30487",
        "label": "Xã Bình Mỹ"
      },
      {
        "id": "ward_30823",
        "label": "Xã Bình Sơn"
      },
      {
        "id": "ward_30445",
        "label": "Xã Bình Thạnh Đông"
      },
      {
        "id": "ward_30595",
        "label": "Xã Cần Đăng"
      },
      {
        "id": "ward_30403",
        "label": "Xã Châu Phong"
      },
      {
        "id": "ward_30463",
        "label": "Xã Châu Phú"
      },
      {
        "id": "ward_30880",
        "label": "Xã Châu Thành"
      },
      {
        "id": "ward_30628",
        "label": "Xã Chợ Mới"
      },
      {
        "id": "ward_30409",
        "label": "Xã Chợ Vàm"
      },
      {
        "id": "ward_30580",
        "label": "Xã Cô Tô"
      },
      {
        "id": "ward_30643",
        "label": "Xã Cù Lao Giêng"
      },
      {
        "id": "ward_30958",
        "label": "Xã Định Hòa"
      },
      {
        "id": "ward_30709",
        "label": "Xã Định Mỹ"
      },
      {
        "id": "ward_31024",
        "label": "Xã Đông Hòa"
      },
      {
        "id": "ward_31036",
        "label": "Xã Đông Hưng"
      },
      {
        "id": "ward_31006",
        "label": "Xã Đông Thái"
      },
      {
        "id": "ward_30796",
        "label": "Xã Giang Thành"
      },
      {
        "id": "ward_30904",
        "label": "Xã Giồng Riềng"
      },
      {
        "id": "ward_30952",
        "label": "Xã Gò Quao"
      },
      {
        "id": "ward_30790",
        "label": "Xã Hòa Điền"
      },
      {
        "id": "ward_30934",
        "label": "Xã Hòa Hưng"
      },
      {
        "id": "ward_30430",
        "label": "Xã Hòa Lạc"
      },
      {
        "id": "ward_30949",
        "label": "Xã Hòa Thuận"
      },
      {
        "id": "ward_30817",
        "label": "Xã Hòn Đất"
      },
      {
        "id": "ward_30814",
        "label": "Xã Hòn Nghệ"
      },
      {
        "id": "ward_30673",
        "label": "Xã Hội An"
      },
      {
        "id": "ward_30341",
        "label": "Xã Khánh Bình"
      },
      {
        "id": "ward_30787",
        "label": "Xã Kiên Lương"
      },
      {
        "id": "ward_30631",
        "label": "Xã Long Điền"
      },
      {
        "id": "ward_30664",
        "label": "Xã Long Kiến"
      },
      {
        "id": "ward_30943",
        "label": "Xã Long Thạnh"
      },
      {
        "id": "ward_30469",
        "label": "Xã Mỹ Đức"
      },
      {
        "id": "ward_30313",
        "label": "Xã Mỹ Hòa Hưng"
      },
      {
        "id": "ward_30838",
        "label": "Xã Mỹ Thuận"
      },
      {
        "id": "ward_30928",
        "label": "Xã Ngọc Chúc"
      },
      {
        "id": "ward_30346",
        "label": "Xã Nhơn Hội"
      },
      {
        "id": "ward_30658",
        "label": "Xã Nhơn Mỹ"
      },
      {
        "id": "ward_30538",
        "label": "Xã Núi Cấm"
      },
      {
        "id": "ward_30688",
        "label": "Xã Óc Eo"
      },
      {
        "id": "ward_30577",
        "label": "Xã Ô Lâm"
      },
      {
        "id": "ward_30436",
        "label": "Xã Phú An"
      },
      {
        "id": "ward_30685",
        "label": "Xã Phú Hòa"
      },
      {
        "id": "ward_30352",
        "label": "Xã Phú Hữu"
      },
      {
        "id": "ward_30421",
        "label": "Xã Phú Lâm"
      },
      {
        "id": "ward_30406",
        "label": "Xã Phú Tân"
      },
      {
        "id": "ward_30811",
        "label": "Xã Sơn Hải"
      },
      {
        "id": "ward_30835",
        "label": "Xã Sơn Kiên"
      },
      {
        "id": "ward_30388",
        "label": "Xã Tân An"
      },
      {
        "id": "ward_30850",
        "label": "Xã Tân Hiệp"
      },
      {
        "id": "ward_30856",
        "label": "Xã Tân Hội"
      },
      {
        "id": "ward_31031",
        "label": "Xã Tân Thạnh"
      },
      {
        "id": "ward_30691",
        "label": "Xã Tây Phú"
      },
      {
        "id": "ward_30988",
        "label": "Xã Tây Yên"
      },
      {
        "id": "ward_30874",
        "label": "Xã Thạnh Đông"
      },
      {
        "id": "ward_30910",
        "label": "Xã Thạnh Hưng"
      },
      {
        "id": "ward_30886",
        "label": "Xã Thạnh Lộc"
      },
      {
        "id": "ward_30481",
        "label": "Xã Thạnh Mỹ Tây"
      },
      {
        "id": "ward_30682",
        "label": "Xã Thoại Sơn"
      },
      {
        "id": "ward_30781",
        "label": "Xã Tiên Hải"
      },
      {
        "id": "ward_30544",
        "label": "Xã Tri Tôn"
      },
      {
        "id": "ward_31027",
        "label": "Xã U Minh Thượng"
      },
      {
        "id": "ward_31042",
        "label": "Xã Vân Khánh"
      },
      {
        "id": "ward_30604",
        "label": "Xã Vĩnh An"
      },
      {
        "id": "ward_31064",
        "label": "Xã Vĩnh Bình"
      },
      {
        "id": "ward_30793",
        "label": "Xã Vĩnh Điều"
      },
      {
        "id": "ward_30568",
        "label": "Xã Vĩnh Gia"
      },
      {
        "id": "ward_30619",
        "label": "Xã Vĩnh Hanh"
      },
      {
        "id": "ward_30367",
        "label": "Xã Vĩnh Hậu"
      },
      {
        "id": "ward_31012",
        "label": "Xã Vĩnh Hòa"
      },
      {
        "id": "ward_30970",
        "label": "Xã Vĩnh Hòa Hưng"
      },
      {
        "id": "ward_31051",
        "label": "Xã Vĩnh Phong"
      },
      {
        "id": "ward_30478",
        "label": "Xã Vĩnh Thạnh Trung"
      },
      {
        "id": "ward_31069",
        "label": "Xã Vĩnh Thuận"
      },
      {
        "id": "ward_30697",
        "label": "Xã Vĩnh Trạch"
      },
      {
        "id": "ward_30982",
        "label": "Xã Vĩnh Tuy"
      },
      {
        "id": "ward_30385",
        "label": "Xã Vĩnh Xương"
      }
    ]
  },
  {
    "id": "bac_ninh",
    "label": "Bắc Ninh",
    "wards": [
      {
        "id": "ward_07210",
        "label": "Phường Bắc Giang"
      },
      {
        "id": "ward_09295",
        "label": "Phường Bồng Lai"
      },
      {
        "id": "ward_07738",
        "label": "Phường Cảnh Thụy"
      },
      {
        "id": "ward_07525",
        "label": "Phường Chũ"
      },
      {
        "id": "ward_07228",
        "label": "Phường Đa Mai"
      },
      {
        "id": "ward_09301",
        "label": "Phường Đào Viên"
      },
      {
        "id": "ward_09385",
        "label": "Phường Đồng Nguyên"
      },
      {
        "id": "ward_09325",
        "label": "Phường Hạp Lĩnh"
      },
      {
        "id": "ward_09187",
        "label": "Phường Kinh Bắc"
      },
      {
        "id": "ward_09409",
        "label": "Phường Mão Điền"
      },
      {
        "id": "ward_09286",
        "label": "Phường Nam Sơn"
      },
      {
        "id": "ward_07795",
        "label": "Phường Nếnh"
      },
      {
        "id": "ward_09253",
        "label": "Phường Nhân Hòa"
      },
      {
        "id": "ward_09445",
        "label": "Phường Ninh Xá"
      },
      {
        "id": "ward_09379",
        "label": "Phường Phù Khê"
      },
      {
        "id": "ward_09265",
        "label": "Phường Phương Liễu"
      },
      {
        "id": "ward_07612",
        "label": "Phường Phượng Sơn"
      },
      {
        "id": "ward_09247",
        "label": "Phường Quế Võ"
      },
      {
        "id": "ward_09433",
        "label": "Phường Song Liễu"
      },
      {
        "id": "ward_09370",
        "label": "Phường Tam Sơn"
      },
      {
        "id": "ward_07682",
        "label": "Phường Tân An"
      },
      {
        "id": "ward_07699",
        "label": "Phường Tân Tiến"
      },
      {
        "id": "ward_09400",
        "label": "Phường Thuận Thành"
      },
      {
        "id": "ward_07696",
        "label": "Phường Tiền Phong"
      },
      {
        "id": "ward_09430",
        "label": "Phường Trạm Lộ"
      },
      {
        "id": "ward_09427",
        "label": "Phường Trí Quả"
      },
      {
        "id": "ward_07774",
        "label": "Phường Tự Lạn"
      },
      {
        "id": "ward_09367",
        "label": "Phường Từ Sơn"
      },
      {
        "id": "ward_07798",
        "label": "Phường Vân Hà"
      },
      {
        "id": "ward_07777",
        "label": "Phường Việt Yên"
      },
      {
        "id": "ward_09190",
        "label": "Phường Võ Cường"
      },
      {
        "id": "ward_09169",
        "label": "Phường Vũ Ninh"
      },
      {
        "id": "ward_07681",
        "label": "Phường Yên Dũng"
      },
      {
        "id": "ward_07654",
        "label": "Xã An Lạc"
      },
      {
        "id": "ward_07462",
        "label": "Xã Bảo Đài"
      },
      {
        "id": "ward_07498",
        "label": "Xã Bắc Lũng"
      },
      {
        "id": "ward_07573",
        "label": "Xã Biển Động"
      },
      {
        "id": "ward_07537",
        "label": "Xã Biên Sơn"
      },
      {
        "id": "ward_07294",
        "label": "Xã Bố Hạ"
      },
      {
        "id": "ward_09466",
        "label": "Xã Cao Đức"
      },
      {
        "id": "ward_07519",
        "label": "Xã Cẩm Lý"
      },
      {
        "id": "ward_09313",
        "label": "Xã Chi Lăng"
      },
      {
        "id": "ward_07672",
        "label": "Xã Dương Hưu"
      },
      {
        "id": "ward_09340",
        "label": "Xã Đại Đồng"
      },
      {
        "id": "ward_09469",
        "label": "Xã Đại Lai"
      },
      {
        "id": "ward_07627",
        "label": "Xã Đại Sơn"
      },
      {
        "id": "ward_07594",
        "label": "Xã Đèo Gia"
      },
      {
        "id": "ward_09487",
        "label": "Xã Đông Cứu"
      },
      {
        "id": "ward_07282",
        "label": "Xã Đồng Kỳ"
      },
      {
        "id": "ward_07450",
        "label": "Xã Đông Phú"
      },
      {
        "id": "ward_07735",
        "label": "Xã Đồng Việt"
      },
      {
        "id": "ward_09454",
        "label": "Xã Gia Bình"
      },
      {
        "id": "ward_07840",
        "label": "Xã Hiệp Hòa"
      },
      {
        "id": "ward_07822",
        "label": "Xã Hoàng Vân"
      },
      {
        "id": "ward_07864",
        "label": "Xã Hợp Thịnh"
      },
      {
        "id": "ward_07399",
        "label": "Xã Kép"
      },
      {
        "id": "ward_07552",
        "label": "Xã Kiên Lao"
      },
      {
        "id": "ward_07375",
        "label": "Xã Lạng Giang"
      },
      {
        "id": "ward_09529",
        "label": "Xã Lâm Thao"
      },
      {
        "id": "ward_09334",
        "label": "Xã Liên Bão"
      },
      {
        "id": "ward_07444",
        "label": "Xã Lục Nam"
      },
      {
        "id": "ward_07582",
        "label": "Xã Lục Ngạn"
      },
      {
        "id": "ward_07492",
        "label": "Xã Lục Sơn"
      },
      {
        "id": "ward_09496",
        "label": "Xã Lương Tài"
      },
      {
        "id": "ward_07420",
        "label": "Xã Mỹ Thái"
      },
      {
        "id": "ward_07603",
        "label": "Xã Nam Dương"
      },
      {
        "id": "ward_07486",
        "label": "Xã Nghĩa Phương"
      },
      {
        "id": "ward_07351",
        "label": "Xã Ngọc Thiện"
      },
      {
        "id": "ward_07306",
        "label": "Xã Nhã Nam"
      },
      {
        "id": "ward_09475",
        "label": "Xã Nhân Thắng"
      },
      {
        "id": "ward_09349",
        "label": "Xã Phật Tích"
      },
      {
        "id": "ward_09292",
        "label": "Xã Phù Lãng"
      },
      {
        "id": "ward_07330",
        "label": "Xã Phúc Hòa"
      },
      {
        "id": "ward_07333",
        "label": "Xã Quang Trung"
      },
      {
        "id": "ward_07534",
        "label": "Xã Sa Lý"
      },
      {
        "id": "ward_07615",
        "label": "Xã Sơn Động"
      },
      {
        "id": "ward_07543",
        "label": "Xã Sơn Hải"
      },
      {
        "id": "ward_09208",
        "label": "Xã Tam Đa"
      },
      {
        "id": "ward_09202",
        "label": "Xã Tam Giang"
      },
      {
        "id": "ward_07264",
        "label": "Xã Tam Tiến"
      },
      {
        "id": "ward_09343",
        "label": "Xã Tân Chi"
      },
      {
        "id": "ward_07432",
        "label": "Xã Tân Dĩnh"
      },
      {
        "id": "ward_07531",
        "label": "Xã Tân Sơn"
      },
      {
        "id": "ward_07339",
        "label": "Xã Tân Yên"
      },
      {
        "id": "ward_07616",
        "label": "Xã Tây Yên Tử"
      },
      {
        "id": "ward_09319",
        "label": "Xã Tiên Du"
      },
      {
        "id": "ward_07381",
        "label": "Xã Tiên Lục"
      },
      {
        "id": "ward_09523",
        "label": "Xã Trung Chính"
      },
      {
        "id": "ward_09499",
        "label": "Xã Trung Kênh"
      },
      {
        "id": "ward_07489",
        "label": "Xã Trường Sơn"
      },
      {
        "id": "ward_07663",
        "label": "Xã Tuấn Đạo"
      },
      {
        "id": "ward_09238",
        "label": "Xã Văn Môn"
      },
      {
        "id": "ward_07621",
        "label": "Xã Vân Sơn"
      },
      {
        "id": "ward_07870",
        "label": "Xã Xuân Cẩm"
      },
      {
        "id": "ward_07246",
        "label": "Xã Xuân Lương"
      },
      {
        "id": "ward_07642",
        "label": "Xã Yên Định"
      },
      {
        "id": "ward_09193",
        "label": "Xã Yên Phong"
      },
      {
        "id": "ward_07288",
        "label": "Xã Yên Thế"
      },
      {
        "id": "ward_09205",
        "label": "Xã Yên Trung"
      }
    ]
  },
  {
    "id": "ca_mau",
    "label": "Cà Mau",
    "wards": [
      {
        "id": "ward_32002",
        "label": "Phường An Xuyên"
      },
      {
        "id": "ward_31825",
        "label": "Phường Bạc Liêu"
      },
      {
        "id": "ward_31942",
        "label": "Phường Giá Rai"
      },
      {
        "id": "ward_31840",
        "label": "Phường Hiệp Thành"
      },
      {
        "id": "ward_32041",
        "label": "Phường Hòa Thành"
      },
      {
        "id": "ward_31951",
        "label": "Phường Láng Tròn"
      },
      {
        "id": "ward_32014",
        "label": "Phường Lý Văn Lâm"
      },
      {
        "id": "ward_32025",
        "label": "Phường Tân Thành"
      },
      {
        "id": "ward_31834",
        "label": "Phường Vĩnh Trạch"
      },
      {
        "id": "ward_31988",
        "label": "Xã An Trạch"
      },
      {
        "id": "ward_32069",
        "label": "Xã Biển Bạch"
      },
      {
        "id": "ward_32212",
        "label": "Xã Cái Đôi Vàm"
      },
      {
        "id": "ward_32128",
        "label": "Xã Cái Nước"
      },
      {
        "id": "ward_31894",
        "label": "Xã Châu Thới"
      },
      {
        "id": "ward_32104",
        "label": "Xã Đá Bạc"
      },
      {
        "id": "ward_32152",
        "label": "Xã Đầm Dơi"
      },
      {
        "id": "ward_32201",
        "label": "Xã Đất Mới"
      },
      {
        "id": "ward_32248",
        "label": "Xã Đất Mũi"
      },
      {
        "id": "ward_31993",
        "label": "Xã Định Thành"
      },
      {
        "id": "ward_31975",
        "label": "Xã Đông Hải"
      },
      {
        "id": "ward_31972",
        "label": "Xã Gành Hào"
      },
      {
        "id": "ward_31891",
        "label": "Xã Hòa Bình"
      },
      {
        "id": "ward_32092",
        "label": "Xã Hồ Thị Kỷ"
      },
      {
        "id": "ward_31843",
        "label": "Xã Hồng Dân"
      },
      {
        "id": "ward_31906",
        "label": "Xã Hưng Hội"
      },
      {
        "id": "ward_32140",
        "label": "Xã Hưng Mỹ"
      },
      {
        "id": "ward_32059",
        "label": "Xã Khánh An"
      },
      {
        "id": "ward_32110",
        "label": "Xã Khánh Bình"
      },
      {
        "id": "ward_32119",
        "label": "Xã Khánh Hưng"
      },
      {
        "id": "ward_32062",
        "label": "Xã Khánh Lâm"
      },
      {
        "id": "ward_31985",
        "label": "Xã Long Điền"
      },
      {
        "id": "ward_32134",
        "label": "Xã Lương Thế Trân"
      },
      {
        "id": "ward_32191",
        "label": "Xã Năm Căn"
      },
      {
        "id": "ward_32044",
        "label": "Xã Nguyễn Phích"
      },
      {
        "id": "ward_32227",
        "label": "Xã Nguyễn Việt Khái"
      },
      {
        "id": "ward_31849",
        "label": "Xã Ninh Quới"
      },
      {
        "id": "ward_31864",
        "label": "Xã Ninh Thạnh Lợi"
      },
      {
        "id": "ward_32244",
        "label": "Xã Phan Ngọc Hiển"
      },
      {
        "id": "ward_31885",
        "label": "Xã Phong Hiệp"
      },
      {
        "id": "ward_31957",
        "label": "Xã Phong Thạnh"
      },
      {
        "id": "ward_32214",
        "label": "Xã Phú Mỹ"
      },
      {
        "id": "ward_32218",
        "label": "Xã Phú Tân"
      },
      {
        "id": "ward_31867",
        "label": "Xã Phước Long"
      },
      {
        "id": "ward_32182",
        "label": "Xã Quách Phẩm"
      },
      {
        "id": "ward_32098",
        "label": "Xã Sông Đốc"
      },
      {
        "id": "ward_32155",
        "label": "Xã Tạ An Khương"
      },
      {
        "id": "ward_32206",
        "label": "Xã Tam Giang"
      },
      {
        "id": "ward_32236",
        "label": "Xã Tân Ân"
      },
      {
        "id": "ward_32137",
        "label": "Xã Tân Hưng"
      },
      {
        "id": "ward_32083",
        "label": "Xã Tân Lộc"
      },
      {
        "id": "ward_32167",
        "label": "Xã Tân Thuận"
      },
      {
        "id": "ward_32188",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_32185",
        "label": "Xã Thanh Tùng"
      },
      {
        "id": "ward_32065",
        "label": "Xã Thới Bình"
      },
      {
        "id": "ward_32161",
        "label": "Xã Trần Phán"
      },
      {
        "id": "ward_32095",
        "label": "Xã Trần Văn Thời"
      },
      {
        "id": "ward_32071",
        "label": "Xã Trí Phải"
      },
      {
        "id": "ward_32047",
        "label": "Xã U Minh"
      },
      {
        "id": "ward_31927",
        "label": "Xã Vĩnh Hậu"
      },
      {
        "id": "ward_31858",
        "label": "Xã Vĩnh Lộc"
      },
      {
        "id": "ward_31900",
        "label": "Xã Vĩnh Lợi"
      },
      {
        "id": "ward_31918",
        "label": "Xã Vĩnh Mỹ"
      },
      {
        "id": "ward_31876",
        "label": "Xã Vĩnh Phước"
      },
      {
        "id": "ward_31882",
        "label": "Xã Vĩnh Thanh"
      }
    ]
  },
  {
    "id": "cao_bang",
    "label": "Cao Bằng",
    "wards": [
      {
        "id": "ward_01279",
        "label": "Phường Nùng Trí Cao"
      },
      {
        "id": "ward_01288",
        "label": "Phường Tân Giang"
      },
      {
        "id": "ward_01273",
        "label": "Phường Thục Phán"
      },
      {
        "id": "ward_01708",
        "label": "Xã Bạch Đằng"
      },
      {
        "id": "ward_01321",
        "label": "Xã Bảo Lạc"
      },
      {
        "id": "ward_01290",
        "label": "Xã Bảo Lâm"
      },
      {
        "id": "ward_01636",
        "label": "Xã Bế Văn Đàn"
      },
      {
        "id": "ward_01738",
        "label": "Xã Ca Thành"
      },
      {
        "id": "ward_01789",
        "label": "Xã Canh Tân"
      },
      {
        "id": "ward_01366",
        "label": "Xã Cần Yên"
      },
      {
        "id": "ward_01327",
        "label": "Xã Cô Ba"
      },
      {
        "id": "ward_01324",
        "label": "Xã Cốc Pàng"
      },
      {
        "id": "ward_01501",
        "label": "Xã Đàm Thủy"
      },
      {
        "id": "ward_01489",
        "label": "Xã Đình Phong"
      },
      {
        "id": "ward_01525",
        "label": "Xã Đoài Dương"
      },
      {
        "id": "ward_01594",
        "label": "Xã Độc Lập"
      },
      {
        "id": "ward_01786",
        "label": "Xã Đông Khê"
      },
      {
        "id": "ward_01822",
        "label": "Xã Đức Long"
      },
      {
        "id": "ward_01558",
        "label": "Xã Hạ Lang"
      },
      {
        "id": "ward_01438",
        "label": "Xã Hà Quảng"
      },
      {
        "id": "ward_01618",
        "label": "Xã Hạnh Phúc"
      },
      {
        "id": "ward_01654",
        "label": "Xã Hòa An"
      },
      {
        "id": "ward_01354",
        "label": "Xã Huy Giáp"
      },
      {
        "id": "ward_01351",
        "label": "Xã Hưng Đạo"
      },
      {
        "id": "ward_01336",
        "label": "Xã Khánh Xuân"
      },
      {
        "id": "ward_01792",
        "label": "Xã Kim Đồng"
      },
      {
        "id": "ward_01393",
        "label": "Xã Lũng Nặm"
      },
      {
        "id": "ward_01294",
        "label": "Xã Lý Bôn"
      },
      {
        "id": "ward_01537",
        "label": "Xã Lý Quốc"
      },
      {
        "id": "ward_01795",
        "label": "Xã Minh Khai"
      },
      {
        "id": "ward_01747",
        "label": "Xã Minh Tâm"
      },
      {
        "id": "ward_01297",
        "label": "Xã Nam Quang"
      },
      {
        "id": "ward_01660",
        "label": "Xã Nam Tuấn"
      },
      {
        "id": "ward_01726",
        "label": "Xã Nguyên Bình"
      },
      {
        "id": "ward_01699",
        "label": "Xã Nguyễn Huệ"
      },
      {
        "id": "ward_01768",
        "label": "Xã Phan Thanh"
      },
      {
        "id": "ward_01648",
        "label": "Xã Phục Hòa"
      },
      {
        "id": "ward_01456",
        "label": "Xã Quang Hán"
      },
      {
        "id": "ward_01304",
        "label": "Xã Quảng Lâm"
      },
      {
        "id": "ward_01552",
        "label": "Xã Quang Long"
      },
      {
        "id": "ward_01465",
        "label": "Xã Quang Trung"
      },
      {
        "id": "ward_01576",
        "label": "Xã Quảng Uyên"
      },
      {
        "id": "ward_01360",
        "label": "Xã Sơn Lộ"
      },
      {
        "id": "ward_01774",
        "label": "Xã Tam Kim"
      },
      {
        "id": "ward_01807",
        "label": "Xã Thạch An"
      },
      {
        "id": "ward_01777",
        "label": "Xã Thành Công"
      },
      {
        "id": "ward_01387",
        "label": "Xã Thanh Long"
      },
      {
        "id": "ward_01363",
        "label": "Xã Thông Nông"
      },
      {
        "id": "ward_01729",
        "label": "Xã Tĩnh Túc"
      },
      {
        "id": "ward_01414",
        "label": "Xã Tổng Cọt"
      },
      {
        "id": "ward_01447",
        "label": "Xã Trà Lĩnh"
      },
      {
        "id": "ward_01477",
        "label": "Xã Trùng Khánh"
      },
      {
        "id": "ward_01392",
        "label": "Xã Trường Hà"
      },
      {
        "id": "ward_01561",
        "label": "Xã Vinh Quý"
      },
      {
        "id": "ward_01339",
        "label": "Xã Xuân Trường"
      },
      {
        "id": "ward_01318",
        "label": "Xã Yên Thổ"
      }
    ]
  },
  {
    "id": "can_tho",
    "label": "Cần Thơ",
    "wards": [
      {
        "id": "ward_31150",
        "label": "Phường An Bình"
      },
      {
        "id": "ward_31168",
        "label": "Phường Bình Thủy"
      },
      {
        "id": "ward_31120",
        "label": "Phường Cái Khế"
      },
      {
        "id": "ward_31186",
        "label": "Phường Cái Răng"
      },
      {
        "id": "ward_31411",
        "label": "Phường Đại Thành"
      },
      {
        "id": "ward_31201",
        "label": "Phường Hưng Phú"
      },
      {
        "id": "ward_31789",
        "label": "Phường Khánh Hòa"
      },
      {
        "id": "ward_31473",
        "label": "Phường Long Bình"
      },
      {
        "id": "ward_31471",
        "label": "Phường Long Mỹ"
      },
      {
        "id": "ward_31480",
        "label": "Phường Long Phú 1"
      },
      {
        "id": "ward_31183",
        "label": "Phường Long Tuyền"
      },
      {
        "id": "ward_31753",
        "label": "Phường Mỹ Quới"
      },
      {
        "id": "ward_31684",
        "label": "Phường Mỹ Xuyên"
      },
      {
        "id": "ward_31340",
        "label": "Phường Ngã Bảy"
      },
      {
        "id": "ward_31732",
        "label": "Phường Ngã Năm"
      },
      {
        "id": "ward_31135",
        "label": "Phường Ninh Kiều"
      },
      {
        "id": "ward_31153",
        "label": "Phường Ô Môn"
      },
      {
        "id": "ward_31510",
        "label": "Phường Phú Lợi"
      },
      {
        "id": "ward_31162",
        "label": "Phường Phước Thới"
      },
      {
        "id": "ward_31507",
        "label": "Phường Sóc Trăng"
      },
      {
        "id": "ward_31147",
        "label": "Phường Tân An"
      },
      {
        "id": "ward_31213",
        "label": "Phường Tân Lộc"
      },
      {
        "id": "ward_31207",
        "label": "Phường Thốt Nốt"
      },
      {
        "id": "ward_31174",
        "label": "Phường Thới An Đông"
      },
      {
        "id": "ward_31157",
        "label": "Phường Thới Long"
      },
      {
        "id": "ward_31228",
        "label": "Phường Thuận Hưng"
      },
      {
        "id": "ward_31217",
        "label": "Phường Trung Nhứt"
      },
      {
        "id": "ward_31333",
        "label": "Phường Vị Tân"
      },
      {
        "id": "ward_31321",
        "label": "Phường Vị Thanh"
      },
      {
        "id": "ward_31783",
        "label": "Phường Vĩnh Châu"
      },
      {
        "id": "ward_31804",
        "label": "Phường Vĩnh Phước"
      },
      {
        "id": "ward_31531",
        "label": "Xã An Lạc Thôn"
      },
      {
        "id": "ward_31594",
        "label": "Xã An Ninh"
      },
      {
        "id": "ward_31615",
        "label": "Xã An Thạnh"
      },
      {
        "id": "ward_31366",
        "label": "Xã Châu Thành"
      },
      {
        "id": "ward_31261",
        "label": "Xã Cờ Đỏ"
      },
      {
        "id": "ward_31633",
        "label": "Xã Cù Lao Dung"
      },
      {
        "id": "ward_31561",
        "label": "Xã Đại Hải"
      },
      {
        "id": "ward_31645",
        "label": "Xã Đại Ngãi"
      },
      {
        "id": "ward_31273",
        "label": "Xã Đông Hiệp"
      },
      {
        "id": "ward_31369",
        "label": "Xã Đông Phước"
      },
      {
        "id": "ward_31282",
        "label": "Xã Đông Thuận"
      },
      {
        "id": "ward_31726",
        "label": "Xã Gia Hòa"
      },
      {
        "id": "ward_31396",
        "label": "Xã Hiệp Hưng"
      },
      {
        "id": "ward_31393",
        "label": "Xã Hòa An"
      },
      {
        "id": "ward_31338",
        "label": "Xã Hỏa Lựu"
      },
      {
        "id": "ward_31717",
        "label": "Xã Hòa Tú"
      },
      {
        "id": "ward_31570",
        "label": "Xã Hồ Đắc Kiện"
      },
      {
        "id": "ward_31528",
        "label": "Xã Kế Sách"
      },
      {
        "id": "ward_31810",
        "label": "Xã Lai Hòa"
      },
      {
        "id": "ward_31759",
        "label": "Xã Lâm Tân"
      },
      {
        "id": "ward_31679",
        "label": "Xã Lịch Hội Thượng"
      },
      {
        "id": "ward_31675",
        "label": "Xã Liêu Tú"
      },
      {
        "id": "ward_31579",
        "label": "Xã Long Hưng"
      },
      {
        "id": "ward_31639",
        "label": "Xã Long Phú"
      },
      {
        "id": "ward_31492",
        "label": "Xã Lương Tâm"
      },
      {
        "id": "ward_31591",
        "label": "Xã Mỹ Hương"
      },
      {
        "id": "ward_31603",
        "label": "Xã Mỹ Phước"
      },
      {
        "id": "ward_31567",
        "label": "Xã Mỹ Tú"
      },
      {
        "id": "ward_31723",
        "label": "Xã Ngọc Tố"
      },
      {
        "id": "ward_31315",
        "label": "Xã Nhơn Ái"
      },
      {
        "id": "ward_31552",
        "label": "Xã Nhơn Mỹ"
      },
      {
        "id": "ward_31708",
        "label": "Xã Nhu Gia"
      },
      {
        "id": "ward_31299",
        "label": "Xã Phong Điền"
      },
      {
        "id": "ward_31537",
        "label": "Xã Phong Nẫm"
      },
      {
        "id": "ward_31378",
        "label": "Xã Phú Hữu"
      },
      {
        "id": "ward_31756",
        "label": "Xã Phú Lộc"
      },
      {
        "id": "ward_31569",
        "label": "Xã Phú Tâm"
      },
      {
        "id": "ward_31420",
        "label": "Xã Phụng Hiệp"
      },
      {
        "id": "ward_31426",
        "label": "Xã Phương Bình"
      },
      {
        "id": "ward_31687",
        "label": "Xã Tài Văn"
      },
      {
        "id": "ward_31399",
        "label": "Xã Tân Bình"
      },
      {
        "id": "ward_31342",
        "label": "Xã Tân Hòa"
      },
      {
        "id": "ward_31741",
        "label": "Xã Tân Long"
      },
      {
        "id": "ward_31432",
        "label": "Xã Tân Phước Hưng"
      },
      {
        "id": "ward_31666",
        "label": "Xã Tân Thạnh"
      },
      {
        "id": "ward_31231",
        "label": "Xã Thạnh An"
      },
      {
        "id": "ward_31408",
        "label": "Xã Thạnh Hòa"
      },
      {
        "id": "ward_31249",
        "label": "Xã Thạnh Phú"
      },
      {
        "id": "ward_31246",
        "label": "Xã Thạnh Quới"
      },
      {
        "id": "ward_31699",
        "label": "Xã Thạnh Thới An"
      },
      {
        "id": "ward_31360",
        "label": "Xã Thạnh Xuân"
      },
      {
        "id": "ward_31540",
        "label": "Xã Thới An Hội"
      },
      {
        "id": "ward_31264",
        "label": "Xã Thới Hưng"
      },
      {
        "id": "ward_31258",
        "label": "Xã Thới Lai"
      },
      {
        "id": "ward_31582",
        "label": "Xã Thuận Hòa"
      },
      {
        "id": "ward_31673",
        "label": "Xã Trần Đề"
      },
      {
        "id": "ward_31255",
        "label": "Xã Trung Hưng"
      },
      {
        "id": "ward_31654",
        "label": "Xã Trường Khánh"
      },
      {
        "id": "ward_31309",
        "label": "Xã Trường Long"
      },
      {
        "id": "ward_31348",
        "label": "Xã Trường Long Tây"
      },
      {
        "id": "ward_31288",
        "label": "Xã Trường Thành"
      },
      {
        "id": "ward_31294",
        "label": "Xã Trường Xuân"
      },
      {
        "id": "ward_31465",
        "label": "Xã Vị Thanh 1"
      },
      {
        "id": "ward_31441",
        "label": "Xã Vị Thủy"
      },
      {
        "id": "ward_31795",
        "label": "Xã Vĩnh Hải"
      },
      {
        "id": "ward_31777",
        "label": "Xã Vĩnh Lợi"
      },
      {
        "id": "ward_31232",
        "label": "Xã Vĩnh Thạnh"
      },
      {
        "id": "ward_31453",
        "label": "Xã Vĩnh Thuận Đông"
      },
      {
        "id": "ward_31237",
        "label": "Xã Vĩnh Trinh"
      },
      {
        "id": "ward_31459",
        "label": "Xã Vĩnh Tường"
      },
      {
        "id": "ward_31489",
        "label": "Xã Vĩnh Viễn"
      },
      {
        "id": "ward_31495",
        "label": "Xã Xà Phiên"
      }
    ]
  },
  {
    "id": "da_nang",
    "label": "Đà Nẵng",
    "wards": [
      {
        "id": "ward_20333",
        "label": "Đặc khu Hoàng Sa"
      },
      {
        "id": "ward_20275",
        "label": "Phường An Hải"
      },
      {
        "id": "ward_20305",
        "label": "Phường An Khê"
      },
      {
        "id": "ward_20575",
        "label": "Phường An Thắng"
      },
      {
        "id": "ward_20335",
        "label": "Phường Bàn Thạch"
      },
      {
        "id": "ward_20260",
        "label": "Phường Cẩm Lệ"
      },
      {
        "id": "ward_20551",
        "label": "Phường Điện Bàn"
      },
      {
        "id": "ward_20557",
        "label": "Phường Điện Bàn Bắc"
      },
      {
        "id": "ward_20579",
        "label": "Phường Điện Bàn Đông"
      },
      {
        "id": "ward_20242",
        "label": "Phường Hải Châu"
      },
      {
        "id": "ward_20194",
        "label": "Phường Hải Vân"
      },
      {
        "id": "ward_20257",
        "label": "Phường Hòa Cường"
      },
      {
        "id": "ward_20200",
        "label": "Phường Hòa Khánh"
      },
      {
        "id": "ward_20314",
        "label": "Phường Hòa Xuân"
      },
      {
        "id": "ward_20410",
        "label": "Phường Hội An"
      },
      {
        "id": "ward_20413",
        "label": "Phường Hội An Đông"
      },
      {
        "id": "ward_20401",
        "label": "Phường Hội An Tây"
      },
      {
        "id": "ward_20350",
        "label": "Phường Hương Trà"
      },
      {
        "id": "ward_20197",
        "label": "Phường Liên Chiểu"
      },
      {
        "id": "ward_20285",
        "label": "Phường Ngũ Hành Sơn"
      },
      {
        "id": "ward_20356",
        "label": "Phường Quảng Phú"
      },
      {
        "id": "ward_20263",
        "label": "Phường Sơn Trà"
      },
      {
        "id": "ward_20341",
        "label": "Phường Tam Kỳ"
      },
      {
        "id": "ward_20209",
        "label": "Phường Thanh Khê"
      },
      {
        "id": "ward_20458",
        "label": "Xã Avương"
      },
      {
        "id": "ward_20308",
        "label": "Xã Bà Nà"
      },
      {
        "id": "ward_20710",
        "label": "Xã Bến Giằng"
      },
      {
        "id": "ward_20494",
        "label": "Xã Bến Hiên"
      },
      {
        "id": "ward_20364",
        "label": "Xã Chiên Đàn"
      },
      {
        "id": "ward_20635",
        "label": "Xã Duy Nghĩa"
      },
      {
        "id": "ward_20623",
        "label": "Xã Duy Xuyên"
      },
      {
        "id": "ward_20500",
        "label": "Xã Đại Lộc"
      },
      {
        "id": "ward_20716",
        "label": "Xã Đắc Pring"
      },
      {
        "id": "ward_20569",
        "label": "Xã Điện Bàn Tây"
      },
      {
        "id": "ward_20818",
        "label": "Xã Đồng Dương"
      },
      {
        "id": "ward_20467",
        "label": "Xã Đông Giang"
      },
      {
        "id": "ward_20977",
        "label": "Xã Đức Phú"
      },
      {
        "id": "ward_20587",
        "label": "Xã Gò Nổi"
      },
      {
        "id": "ward_20515",
        "label": "Xã Hà Nha"
      },
      {
        "id": "ward_20779",
        "label": "Xã Hiệp Đức"
      },
      {
        "id": "ward_20332",
        "label": "Xã Hòa Tiến"
      },
      {
        "id": "ward_20320",
        "label": "Xã Hòa Vang"
      },
      {
        "id": "ward_20443",
        "label": "Xã Hùng Sơn"
      },
      {
        "id": "ward_20722",
        "label": "Xã Khâm Đức"
      },
      {
        "id": "ward_20704",
        "label": "Xã La Dêê"
      },
      {
        "id": "ward_20698",
        "label": "Xã La Êê"
      },
      {
        "id": "ward_20875",
        "label": "Xã Lãnh Ngọc"
      },
      {
        "id": "ward_20707",
        "label": "Xã Nam Giang"
      },
      {
        "id": "ward_20599",
        "label": "Xã Nam Phước"
      },
      {
        "id": "ward_20944",
        "label": "Xã Nam Trà My"
      },
      {
        "id": "ward_20656",
        "label": "Xã Nông Sơn"
      },
      {
        "id": "ward_20965",
        "label": "Xã Núi Thành"
      },
      {
        "id": "ward_20392",
        "label": "Xã Phú Ninh"
      },
      {
        "id": "ward_20542",
        "label": "Xã Phú Thuận"
      },
      {
        "id": "ward_20740",
        "label": "Xã Phước Chánh"
      },
      {
        "id": "ward_20728",
        "label": "Xã Phước Hiệp"
      },
      {
        "id": "ward_20734",
        "label": "Xã Phước Năng"
      },
      {
        "id": "ward_20752",
        "label": "Xã Phước Thành"
      },
      {
        "id": "ward_20770",
        "label": "Xã Phước Trà"
      },
      {
        "id": "ward_20669",
        "label": "Xã Quế Phước"
      },
      {
        "id": "ward_20641",
        "label": "Xã Quế Sơn"
      },
      {
        "id": "ward_20662",
        "label": "Xã Quế Sơn Trung"
      },
      {
        "id": "ward_20476",
        "label": "Xã Sông Kôn"
      },
      {
        "id": "ward_20485",
        "label": "Xã Sông Vàng"
      },
      {
        "id": "ward_20857",
        "label": "Xã Sơn Cẩm Hà"
      },
      {
        "id": "ward_20984",
        "label": "Xã Tam Anh"
      },
      {
        "id": "ward_20992",
        "label": "Xã Tam Hải"
      },
      {
        "id": "ward_21004",
        "label": "Xã Tam Mỹ"
      },
      {
        "id": "ward_20971",
        "label": "Xã Tam Xuân"
      },
      {
        "id": "ward_20434",
        "label": "Xã Tân Hiệp"
      },
      {
        "id": "ward_20455",
        "label": "Xã Tây Giang"
      },
      {
        "id": "ward_20380",
        "label": "Xã Tây Hồ"
      },
      {
        "id": "ward_20878",
        "label": "Xã Thạnh Bình"
      },
      {
        "id": "ward_20695",
        "label": "Xã Thạnh Mỹ"
      },
      {
        "id": "ward_20794",
        "label": "Xã Thăng An"
      },
      {
        "id": "ward_20791",
        "label": "Xã Thăng Bình"
      },
      {
        "id": "ward_20848",
        "label": "Xã Thăng Điền"
      },
      {
        "id": "ward_20827",
        "label": "Xã Thăng Phú"
      },
      {
        "id": "ward_20836",
        "label": "Xã Thăng Trường"
      },
      {
        "id": "ward_20611",
        "label": "Xã Thu Bồn"
      },
      {
        "id": "ward_20506",
        "label": "Xã Thượng Đức"
      },
      {
        "id": "ward_20854",
        "label": "Xã Tiên Phước"
      },
      {
        "id": "ward_20920",
        "label": "Xã Trà Đốc"
      },
      {
        "id": "ward_20929",
        "label": "Xã Trà Giáp"
      },
      {
        "id": "ward_20938",
        "label": "Xã Trà Leng"
      },
      {
        "id": "ward_20908",
        "label": "Xã Trà Liên"
      },
      {
        "id": "ward_20950",
        "label": "Xã Trà Linh"
      },
      {
        "id": "ward_20900",
        "label": "Xã Trà My"
      },
      {
        "id": "ward_20923",
        "label": "Xã Trà Tân"
      },
      {
        "id": "ward_20941",
        "label": "Xã Trà Tập"
      },
      {
        "id": "ward_20959",
        "label": "Xã Trà Vân"
      },
      {
        "id": "ward_20767",
        "label": "Xã Việt An"
      },
      {
        "id": "ward_20539",
        "label": "Xã Vu Gia"
      },
      {
        "id": "ward_20650",
        "label": "Xã Xuân Phú"
      }
    ]
  },
  {
    "id": "dak_lak",
    "label": "Đắk Lắk",
    "wards": [
      {
        "id": "ward_22045",
        "label": "Phường Bình Kiến"
      },
      {
        "id": "ward_24305",
        "label": "Phường Buôn Hồ"
      },
      {
        "id": "ward_24133",
        "label": "Phường Buôn Ma Thuột"
      },
      {
        "id": "ward_24340",
        "label": "Phường Cư Bao"
      },
      {
        "id": "ward_22258",
        "label": "Phường Đông Hòa"
      },
      {
        "id": "ward_24169",
        "label": "Phường Ea Kao"
      },
      {
        "id": "ward_22261",
        "label": "Phường Hòa Hiệp"
      },
      {
        "id": "ward_22240",
        "label": "Phường Phú Yên"
      },
      {
        "id": "ward_22051",
        "label": "Phường Sông Cầu"
      },
      {
        "id": "ward_24163",
        "label": "Phường Tân An"
      },
      {
        "id": "ward_24121",
        "label": "Phường Tân Lập"
      },
      {
        "id": "ward_24154",
        "label": "Phường Thành Nhất"
      },
      {
        "id": "ward_22015",
        "label": "Phường Tuy Hòa"
      },
      {
        "id": "ward_22076",
        "label": "Phường Xuân Đài"
      },
      {
        "id": "ward_24235",
        "label": "Xã Buôn Đôn"
      },
      {
        "id": "ward_24301",
        "label": "Xã Cuôr Đăng"
      },
      {
        "id": "ward_24280",
        "label": "Xã Cư M’gar"
      },
      {
        "id": "ward_24436",
        "label": "Xã Cư M’ta"
      },
      {
        "id": "ward_24313",
        "label": "Xã Cư Pơng"
      },
      {
        "id": "ward_24415",
        "label": "Xã Cư Prao"
      },
      {
        "id": "ward_24478",
        "label": "Xã Cư Pui"
      },
      {
        "id": "ward_24406",
        "label": "Xã Cư Yang"
      },
      {
        "id": "ward_24454",
        "label": "Xã Dang Kang"
      },
      {
        "id": "ward_24346",
        "label": "Xã Dliê Ya"
      },
      {
        "id": "ward_24561",
        "label": "Xã Dray Bhăng"
      },
      {
        "id": "ward_24568",
        "label": "Xã Dur Kmăl"
      },
      {
        "id": "ward_24595",
        "label": "Xã Đắk Liêng"
      },
      {
        "id": "ward_24598",
        "label": "Xã Đắk Phơi"
      },
      {
        "id": "ward_22081",
        "label": "Xã Đồng Xuân"
      },
      {
        "id": "ward_22222",
        "label": "Xã Đức Bình"
      },
      {
        "id": "ward_22225",
        "label": "Xã Ea Bá"
      },
      {
        "id": "ward_24229",
        "label": "Xã Ea Bung"
      },
      {
        "id": "ward_24181",
        "label": "Xã Ea Drăng"
      },
      {
        "id": "ward_24328",
        "label": "Xã Ea Drông"
      },
      {
        "id": "ward_24184",
        "label": "Xã Ea H’Leo"
      },
      {
        "id": "ward_24187",
        "label": "Xã Ea Hiao"
      },
      {
        "id": "ward_24373",
        "label": "Xã Ea Kar"
      },
      {
        "id": "ward_24208",
        "label": "Xã Ea Khăl"
      },
      {
        "id": "ward_24265",
        "label": "Xã Ea Kiết"
      },
      {
        "id": "ward_24496",
        "label": "Xã Ea Kly"
      },
      {
        "id": "ward_24376",
        "label": "Xã Ea Knốp"
      },
      {
        "id": "ward_24505",
        "label": "Xã Ea Knuếc"
      },
      {
        "id": "ward_24544",
        "label": "Xã Ea Ktur"
      },
      {
        "id": "ward_22237",
        "label": "Xã Ea Ly"
      },
      {
        "id": "ward_24286",
        "label": "Xã Ea M’Droh"
      },
      {
        "id": "ward_24559",
        "label": "Xã Ea Na"
      },
      {
        "id": "ward_24540",
        "label": "Xã Ea Ning"
      },
      {
        "id": "ward_24250",
        "label": "Xã Ea Nuôl"
      },
      {
        "id": "ward_24403",
        "label": "Xã Ea Ô"
      },
      {
        "id": "ward_24400",
        "label": "Xã Ea Păl"
      },
      {
        "id": "ward_24502",
        "label": "Xã Ea Phê"
      },
      {
        "id": "ward_24433",
        "label": "Xã Ea Riêng"
      },
      {
        "id": "ward_24217",
        "label": "Xã Ea Rốk"
      },
      {
        "id": "ward_24211",
        "label": "Xã Ea Súp"
      },
      {
        "id": "ward_24445",
        "label": "Xã Ea Trang"
      },
      {
        "id": "ward_24277",
        "label": "Xã Ea Tul"
      },
      {
        "id": "ward_24241",
        "label": "Xã Ea Wer"
      },
      {
        "id": "ward_24193",
        "label": "Xã Ea Wy"
      },
      {
        "id": "ward_22285",
        "label": "Xã Hòa Mỹ"
      },
      {
        "id": "ward_24175",
        "label": "Xã Hòa Phú"
      },
      {
        "id": "ward_24472",
        "label": "Xã Hòa Sơn"
      },
      {
        "id": "ward_22276",
        "label": "Xã Hòa Thịnh"
      },
      {
        "id": "ward_22291",
        "label": "Xã Hòa Xuân"
      },
      {
        "id": "ward_24214",
        "label": "Xã Ia Lốp"
      },
      {
        "id": "ward_24221",
        "label": "Xã Ia Rvê"
      },
      {
        "id": "ward_24444",
        "label": "Xã Krông Á"
      },
      {
        "id": "ward_24538",
        "label": "Xã Krông Ana"
      },
      {
        "id": "ward_24448",
        "label": "Xã Krông Bông"
      },
      {
        "id": "ward_24310",
        "label": "Xã Krông Búk"
      },
      {
        "id": "ward_24343",
        "label": "Xã Krông Năng"
      },
      {
        "id": "ward_24604",
        "label": "Xã Krông Nô"
      },
      {
        "id": "ward_24490",
        "label": "Xã Krông Pắc"
      },
      {
        "id": "ward_24580",
        "label": "Xã Liên Sơn Lắk"
      },
      {
        "id": "ward_24412",
        "label": "Xã M’Drắk"
      },
      {
        "id": "ward_24607",
        "label": "Xã Nam Ka"
      },
      {
        "id": "ward_22147",
        "label": "Xã Ô Loan"
      },
      {
        "id": "ward_22319",
        "label": "Xã Phú Hòa 1"
      },
      {
        "id": "ward_22303",
        "label": "Xã Phú Hòa 2"
      },
      {
        "id": "ward_22096",
        "label": "Xã Phú Mỡ"
      },
      {
        "id": "ward_24364",
        "label": "Xã Phú Xuân"
      },
      {
        "id": "ward_24316",
        "label": "Xã Pơng Drang"
      },
      {
        "id": "ward_24259",
        "label": "Xã Quảng Phú"
      },
      {
        "id": "ward_22207",
        "label": "Xã Sông Hinh"
      },
      {
        "id": "ward_22165",
        "label": "Xã Sơn Hòa"
      },
      {
        "id": "ward_22250",
        "label": "Xã Sơn Thành"
      },
      {
        "id": "ward_22192",
        "label": "Xã Suối Trai"
      },
      {
        "id": "ward_24352",
        "label": "Xã Tam Giang"
      },
      {
        "id": "ward_24526",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_22255",
        "label": "Xã Tây Hòa"
      },
      {
        "id": "ward_22171",
        "label": "Xã Tây Sơn"
      },
      {
        "id": "ward_22114",
        "label": "Xã Tuy An Bắc"
      },
      {
        "id": "ward_22120",
        "label": "Xã Tuy An Đông"
      },
      {
        "id": "ward_22153",
        "label": "Xã Tuy An Nam"
      },
      {
        "id": "ward_22132",
        "label": "Xã Tuy An Tây"
      },
      {
        "id": "ward_22177",
        "label": "Xã Vân Hòa"
      },
      {
        "id": "ward_24529",
        "label": "Xã Vụ Bổn"
      },
      {
        "id": "ward_22060",
        "label": "Xã Xuân Cảnh"
      },
      {
        "id": "ward_22090",
        "label": "Xã Xuân Lãnh"
      },
      {
        "id": "ward_22057",
        "label": "Xã Xuân Lộc"
      },
      {
        "id": "ward_22111",
        "label": "Xã Xuân Phước"
      },
      {
        "id": "ward_22075",
        "label": "Xã Xuân Thọ"
      },
      {
        "id": "ward_24484",
        "label": "Xã Yang Mao"
      }
    ]
  },
  {
    "id": "dien_bien",
    "label": "Điện Biên",
    "wards": [
      {
        "id": "ward_03127",
        "label": "Phường Điện Biên Phủ"
      },
      {
        "id": "ward_03151",
        "label": "Phường Mường Lay"
      },
      {
        "id": "ward_03334",
        "label": "Phường Mường Thanh"
      },
      {
        "id": "ward_03301",
        "label": "Xã Búng Lao"
      },
      {
        "id": "ward_03175",
        "label": "Xã Chà Tở"
      },
      {
        "id": "ward_03283",
        "label": "Xã Chiềng Sinh"
      },
      {
        "id": "ward_03256",
        "label": "Xã Mường Ảng"
      },
      {
        "id": "ward_03166",
        "label": "Xã Mường Chà"
      },
      {
        "id": "ward_03313",
        "label": "Xã Mường Lạn"
      },
      {
        "id": "ward_03214",
        "label": "Xã Mường Luân"
      },
      {
        "id": "ward_03268",
        "label": "Xã Mường Mùn"
      },
      {
        "id": "ward_03368",
        "label": "Xã Mường Nhà"
      },
      {
        "id": "ward_03160",
        "label": "Xã Mường Nhé"
      },
      {
        "id": "ward_03325",
        "label": "Xã Mường Phăng"
      },
      {
        "id": "ward_03202",
        "label": "Xã Mường Pồn"
      },
      {
        "id": "ward_03163",
        "label": "Xã Mường Toong"
      },
      {
        "id": "ward_03181",
        "label": "Xã Mường Tùng"
      },
      {
        "id": "ward_03176",
        "label": "Xã Nà Bủng"
      },
      {
        "id": "ward_03169",
        "label": "Xã Nà Hỳ"
      },
      {
        "id": "ward_03172",
        "label": "Xã Na Sang"
      },
      {
        "id": "ward_03203",
        "label": "Xã Na Son"
      },
      {
        "id": "ward_03316",
        "label": "Xã Nà Tấu"
      },
      {
        "id": "ward_03162",
        "label": "Xã Nậm Kè"
      },
      {
        "id": "ward_03194",
        "label": "Xã Nậm Nèn"
      },
      {
        "id": "ward_03358",
        "label": "Xã Núa Ngam"
      },
      {
        "id": "ward_03193",
        "label": "Xã Pa Ham"
      },
      {
        "id": "ward_03382",
        "label": "Xã Phình Giàng"
      },
      {
        "id": "ward_03370",
        "label": "Xã Pu Nhi"
      },
      {
        "id": "ward_03260",
        "label": "Xã Pú Nhung"
      },
      {
        "id": "ward_03295",
        "label": "Xã Quài Tở"
      },
      {
        "id": "ward_03164",
        "label": "Xã Quảng Lâm"
      },
      {
        "id": "ward_03356",
        "label": "Xã Sam Mứn"
      },
      {
        "id": "ward_03244",
        "label": "Xã Sáng Nhè"
      },
      {
        "id": "ward_03199",
        "label": "Xã Si Pa Phìn"
      },
      {
        "id": "ward_03226",
        "label": "Xã Sín Chải"
      },
      {
        "id": "ward_03158",
        "label": "Xã Sín Thầu"
      },
      {
        "id": "ward_03241",
        "label": "Xã Sính Phình"
      },
      {
        "id": "ward_03352",
        "label": "Xã Thanh An"
      },
      {
        "id": "ward_03328",
        "label": "Xã Thanh Nưa"
      },
      {
        "id": "ward_03349",
        "label": "Xã Thanh Yên"
      },
      {
        "id": "ward_03385",
        "label": "Xã Tìa Dình"
      },
      {
        "id": "ward_03217",
        "label": "Xã Tủa Chùa"
      },
      {
        "id": "ward_03220",
        "label": "Xã Tủa Thàng"
      },
      {
        "id": "ward_03253",
        "label": "Xã Tuần Giáo"
      },
      {
        "id": "ward_03208",
        "label": "Xã Xa Dung"
      }
    ]
  },
  {
    "id": "dong_nai",
    "label": "Đồng Nai",
    "wards": [
      {
        "id": "ward_25333",
        "label": "Phường An Lộc"
      },
      {
        "id": "ward_26098",
        "label": "Phường Bảo Vinh"
      },
      {
        "id": "ward_26068",
        "label": "Phường Biên Hòa"
      },
      {
        "id": "ward_25326",
        "label": "Phường Bình Long"
      },
      {
        "id": "ward_26089",
        "label": "Phường Bình Lộc"
      },
      {
        "id": "ward_25195",
        "label": "Phường Bình Phước"
      },
      {
        "id": "ward_25432",
        "label": "Phường Chơn Thành"
      },
      {
        "id": "ward_25210",
        "label": "Phường Đồng Xoài"
      },
      {
        "id": "ward_26113",
        "label": "Phường Hàng Gòn"
      },
      {
        "id": "ward_26005",
        "label": "Phường Hố Nai"
      },
      {
        "id": "ward_26020",
        "label": "Phường Long Bình"
      },
      {
        "id": "ward_26380",
        "label": "Phường Long Hưng"
      },
      {
        "id": "ward_26080",
        "label": "Phường Long Khánh"
      },
      {
        "id": "ward_25441",
        "label": "Phường Minh Hưng"
      },
      {
        "id": "ward_25220",
        "label": "Phường Phước Bình"
      },
      {
        "id": "ward_25217",
        "label": "Phường Phước Long"
      },
      {
        "id": "ward_26377",
        "label": "Phường Phước Tân"
      },
      {
        "id": "ward_26017",
        "label": "Phường Tam Hiệp"
      },
      {
        "id": "ward_26374",
        "label": "Phường Tam Phước"
      },
      {
        "id": "ward_26188",
        "label": "Phường Tân Triều"
      },
      {
        "id": "ward_25993",
        "label": "Phường Trảng Dài"
      },
      {
        "id": "ward_26041",
        "label": "Phường Trấn Biên"
      },
      {
        "id": "ward_26104",
        "label": "Phường Xuân Lập"
      },
      {
        "id": "ward_26383",
        "label": "Xã An Phước"
      },
      {
        "id": "ward_26296",
        "label": "Xã An Viễn"
      },
      {
        "id": "ward_26254",
        "label": "Xã Bàu Hàm"
      },
      {
        "id": "ward_26389",
        "label": "Xã Bình An"
      },
      {
        "id": "ward_26278",
        "label": "Xã Bình Minh"
      },
      {
        "id": "ward_25246",
        "label": "Xã Bình Tân"
      },
      {
        "id": "ward_25405",
        "label": "Xã Bom Bo"
      },
      {
        "id": "ward_25396",
        "label": "Xã Bù Đăng"
      },
      {
        "id": "ward_25222",
        "label": "Xã Bù Gia Mập"
      },
      {
        "id": "ward_26341",
        "label": "Xã Cẩm Mỹ"
      },
      {
        "id": "ward_26326",
        "label": "Xã Dầu Giây"
      },
      {
        "id": "ward_25231",
        "label": "Xã Đa Kia"
      },
      {
        "id": "ward_26491",
        "label": "Xã Đại Phước"
      },
      {
        "id": "ward_26119",
        "label": "Xã Đak Lua"
      },
      {
        "id": "ward_25399",
        "label": "Xã Đak Nhau"
      },
      {
        "id": "ward_25225",
        "label": "Xã Đăk Ơ"
      },
      {
        "id": "ward_26206",
        "label": "Xã Định Quán"
      },
      {
        "id": "ward_25363",
        "label": "Xã Đồng Phú"
      },
      {
        "id": "ward_25390",
        "label": "Xã Đồng Tâm"
      },
      {
        "id": "ward_26311",
        "label": "Xã Gia Kiệm"
      },
      {
        "id": "ward_25309",
        "label": "Xã Hưng Phước"
      },
      {
        "id": "ward_26281",
        "label": "Xã Hưng Thịnh"
      },
      {
        "id": "ward_26227",
        "label": "Xã La Ngà"
      },
      {
        "id": "ward_25255",
        "label": "Xã Long Hà"
      },
      {
        "id": "ward_26413",
        "label": "Xã Long Phước"
      },
      {
        "id": "ward_26368",
        "label": "Xã Long Thành"
      },
      {
        "id": "ward_25303",
        "label": "Xã Lộc Hưng"
      },
      {
        "id": "ward_25270",
        "label": "Xã Lộc Ninh"
      },
      {
        "id": "ward_25292",
        "label": "Xã Lộc Quang"
      },
      {
        "id": "ward_25279",
        "label": "Xã Lộc Tấn"
      },
      {
        "id": "ward_25294",
        "label": "Xã Lộc Thành"
      },
      {
        "id": "ward_25280",
        "label": "Xã Lộc Thạnh"
      },
      {
        "id": "ward_25349",
        "label": "Xã Minh Đức"
      },
      {
        "id": "ward_26122",
        "label": "Xã Nam Cát Tiên"
      },
      {
        "id": "ward_25417",
        "label": "Xã Nghĩa Trung"
      },
      {
        "id": "ward_25450",
        "label": "Xã Nha Bích"
      },
      {
        "id": "ward_26485",
        "label": "Xã Nhơn Trạch"
      },
      {
        "id": "ward_26221",
        "label": "Xã Phú Hòa"
      },
      {
        "id": "ward_26158",
        "label": "Xã Phú Lâm"
      },
      {
        "id": "ward_26173",
        "label": "Xã Phú Lý"
      },
      {
        "id": "ward_25267",
        "label": "Xã Phú Nghĩa"
      },
      {
        "id": "ward_25252",
        "label": "Xã Phú Riềng"
      },
      {
        "id": "ward_25261",
        "label": "Xã Phú Trung"
      },
      {
        "id": "ward_26215",
        "label": "Xã Phú Vinh"
      },
      {
        "id": "ward_26503",
        "label": "Xã Phước An"
      },
      {
        "id": "ward_25420",
        "label": "Xã Phước Sơn"
      },
      {
        "id": "ward_26422",
        "label": "Xã Phước Thái"
      },
      {
        "id": "ward_26362",
        "label": "Xã Sông Ray"
      },
      {
        "id": "ward_26134",
        "label": "Xã Tà Lài"
      },
      {
        "id": "ward_26179",
        "label": "Xã Tân An"
      },
      {
        "id": "ward_25345",
        "label": "Xã Tân Hưng"
      },
      {
        "id": "ward_25357",
        "label": "Xã Tân Khai"
      },
      {
        "id": "ward_25378",
        "label": "Xã Tân Lợi"
      },
      {
        "id": "ward_26116",
        "label": "Xã Tân Phú"
      },
      {
        "id": "ward_25351",
        "label": "Xã Tân Quan"
      },
      {
        "id": "ward_25318",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_26209",
        "label": "Xã Thanh Sơn"
      },
      {
        "id": "ward_25308",
        "label": "Xã Thiện Hưng"
      },
      {
        "id": "ward_25402",
        "label": "Xã Thọ Sơn"
      },
      {
        "id": "ward_26299",
        "label": "Xã Thống Nhất"
      },
      {
        "id": "ward_25387",
        "label": "Xã Thuận Lợi"
      },
      {
        "id": "ward_26248",
        "label": "Xã Trảng Bom"
      },
      {
        "id": "ward_26170",
        "label": "Xã Trị An"
      },
      {
        "id": "ward_26428",
        "label": "Xã Xuân Bắc"
      },
      {
        "id": "ward_26461",
        "label": "Xã Xuân Định"
      },
      {
        "id": "ward_26359",
        "label": "Xã Xuân Đông"
      },
      {
        "id": "ward_26347",
        "label": "Xã Xuân Đường"
      },
      {
        "id": "ward_26446",
        "label": "Xã Xuân Hòa"
      },
      {
        "id": "ward_26425",
        "label": "Xã Xuân Lộc"
      },
      {
        "id": "ward_26458",
        "label": "Xã Xuân Phú"
      },
      {
        "id": "ward_26332",
        "label": "Xã Xuân Quế"
      },
      {
        "id": "ward_26434",
        "label": "Xã Xuân Thành"
      }
    ]
  },
  {
    "id": "dong_thap",
    "label": "Đồng Tháp",
    "wards": [
      {
        "id": "ward_29954",
        "label": "Phường An Bình"
      },
      {
        "id": "ward_28315",
        "label": "Phường Bình Xuân"
      },
      {
        "id": "ward_28439",
        "label": "Phường Cai Lậy"
      },
      {
        "id": "ward_29869",
        "label": "Phường Cao Lãnh"
      },
      {
        "id": "ward_28249",
        "label": "Phường Đạo Thạnh"
      },
      {
        "id": "ward_28306",
        "label": "Phường Gò Công"
      },
      {
        "id": "ward_29955",
        "label": "Phường Hồng Ngự"
      },
      {
        "id": "ward_28297",
        "label": "Phường Long Thuận"
      },
      {
        "id": "ward_29884",
        "label": "Phường Mỹ Ngãi"
      },
      {
        "id": "ward_28273",
        "label": "Phường Mỹ Phong"
      },
      {
        "id": "ward_28435",
        "label": "Phường Mỹ Phước Tây"
      },
      {
        "id": "ward_28261",
        "label": "Phường Mỹ Tho"
      },
      {
        "id": "ward_29888",
        "label": "Phường Mỹ Trà"
      },
      {
        "id": "ward_28477",
        "label": "Phường Nhị Quý"
      },
      {
        "id": "ward_29905",
        "label": "Phường Sa Đéc"
      },
      {
        "id": "ward_28729",
        "label": "Phường Sơn Qui"
      },
      {
        "id": "ward_28436",
        "label": "Phường Thanh Hòa"
      },
      {
        "id": "ward_28270",
        "label": "Phường Thới Sơn"
      },
      {
        "id": "ward_29978",
        "label": "Phường Thường Lạc"
      },
      {
        "id": "ward_28285",
        "label": "Phường Trung An"
      },
      {
        "id": "ward_30019",
        "label": "Xã An Hòa"
      },
      {
        "id": "ward_28429",
        "label": "Xã An Hữu"
      },
      {
        "id": "ward_30028",
        "label": "Xã An Long"
      },
      {
        "id": "ward_29944",
        "label": "Xã An Phước"
      },
      {
        "id": "ward_28633",
        "label": "Xã An Thạnh Thủy"
      },
      {
        "id": "ward_30085",
        "label": "Xã Ba Sao"
      },
      {
        "id": "ward_30118",
        "label": "Xã Bình Hàng Trung"
      },
      {
        "id": "ward_28648",
        "label": "Xã Bình Ninh"
      },
      {
        "id": "ward_28471",
        "label": "Xã Bình Phú"
      },
      {
        "id": "ward_30163",
        "label": "Xã Bình Thành"
      },
      {
        "id": "ward_28564",
        "label": "Xã Bình Trưng"
      },
      {
        "id": "ward_28360",
        "label": "Xã Cái Bè"
      },
      {
        "id": "ward_28519",
        "label": "Xã Châu Thành"
      },
      {
        "id": "ward_28594",
        "label": "Xã Chợ Gạo"
      },
      {
        "id": "ward_30061",
        "label": "Xã Đốc Binh Kiều"
      },
      {
        "id": "ward_28660",
        "label": "Xã Đồng Sơn"
      },
      {
        "id": "ward_28720",
        "label": "Xã Gia Thuận"
      },
      {
        "id": "ward_28747",
        "label": "Xã Gò Công Đông"
      },
      {
        "id": "ward_28366",
        "label": "Xã Hậu Mỹ"
      },
      {
        "id": "ward_28501",
        "label": "Xã Hiệp Đức"
      },
      {
        "id": "ward_30208",
        "label": "Xã Hòa Long"
      },
      {
        "id": "ward_28393",
        "label": "Xã Hội Cư"
      },
      {
        "id": "ward_28336",
        "label": "Xã Hưng Thạnh"
      },
      {
        "id": "ward_28582",
        "label": "Xã Kim Sơn"
      },
      {
        "id": "ward_30226",
        "label": "Xã Lai Vung"
      },
      {
        "id": "ward_30169",
        "label": "Xã Lấp Vò"
      },
      {
        "id": "ward_28687",
        "label": "Xã Long Bình"
      },
      {
        "id": "ward_28543",
        "label": "Xã Long Định"
      },
      {
        "id": "ward_28537",
        "label": "Xã Long Hưng"
      },
      {
        "id": "ward_29983",
        "label": "Xã Long Khánh"
      },
      {
        "id": "ward_29992",
        "label": "Xã Long Phú Thuận"
      },
      {
        "id": "ward_28504",
        "label": "Xã Long Tiên"
      },
      {
        "id": "ward_28615",
        "label": "Xã Lương Hòa Lạc"
      },
      {
        "id": "ward_30178",
        "label": "Xã Mỹ An Hưng"
      },
      {
        "id": "ward_28405",
        "label": "Xã Mỹ Đức Tây"
      },
      {
        "id": "ward_30112",
        "label": "Xã Mỹ Hiệp"
      },
      {
        "id": "ward_28414",
        "label": "Xã Mỹ Lợi"
      },
      {
        "id": "ward_30055",
        "label": "Xã Mỹ Quí"
      },
      {
        "id": "ward_28456",
        "label": "Xã Mỹ Thành"
      },
      {
        "id": "ward_28378",
        "label": "Xã Mỹ Thiện"
      },
      {
        "id": "ward_30076",
        "label": "Xã Mỹ Thọ"
      },
      {
        "id": "ward_28603",
        "label": "Xã Mỹ Tịnh An"
      },
      {
        "id": "ward_28516",
        "label": "Xã Ngũ Hiệp"
      },
      {
        "id": "ward_30235",
        "label": "Xã Phong Hòa"
      },
      {
        "id": "ward_30088",
        "label": "Xã Phong Mỹ"
      },
      {
        "id": "ward_30025",
        "label": "Xã Phú Cường"
      },
      {
        "id": "ward_30244",
        "label": "Xã Phú Hựu"
      },
      {
        "id": "ward_28663",
        "label": "Xã Phú Thành"
      },
      {
        "id": "ward_30034",
        "label": "Xã Phú Thọ"
      },
      {
        "id": "ward_30043",
        "label": "Xã Phương Thịnh"
      },
      {
        "id": "ward_30010",
        "label": "Xã Tam Nông"
      },
      {
        "id": "ward_30214",
        "label": "Xã Tân Dương"
      },
      {
        "id": "ward_28738",
        "label": "Xã Tân Điền"
      },
      {
        "id": "ward_28723",
        "label": "Xã Tân Đông"
      },
      {
        "id": "ward_28702",
        "label": "Xã Tân Hòa"
      },
      {
        "id": "ward_29929",
        "label": "Xã Tân Hộ Cơ"
      },
      {
        "id": "ward_29926",
        "label": "Xã Tân Hồng"
      },
      {
        "id": "ward_28525",
        "label": "Xã Tân Hương"
      },
      {
        "id": "ward_30184",
        "label": "Xã Tân Khánh Trung"
      },
      {
        "id": "ward_30154",
        "label": "Xã Tân Long"
      },
      {
        "id": "ward_30253",
        "label": "Xã Tân Nhuận Đông"
      },
      {
        "id": "ward_28468",
        "label": "Xã Tân Phú"
      },
      {
        "id": "ward_28696",
        "label": "Xã Tân Phú Đông"
      },
      {
        "id": "ward_30259",
        "label": "Xã Tân Phú Trung"
      },
      {
        "id": "ward_28321",
        "label": "Xã Tân Phước 1"
      },
      {
        "id": "ward_28327",
        "label": "Xã Tân Phước 2"
      },
      {
        "id": "ward_28345",
        "label": "Xã Tân Phước 3"
      },
      {
        "id": "ward_29938",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_30157",
        "label": "Xã Tân Thạnh"
      },
      {
        "id": "ward_28693",
        "label": "Xã Tân Thới"
      },
      {
        "id": "ward_28627",
        "label": "Xã Tân Thuận Bình"
      },
      {
        "id": "ward_30130",
        "label": "Xã Thanh Bình"
      },
      {
        "id": "ward_28426",
        "label": "Xã Thanh Hưng"
      },
      {
        "id": "ward_30073",
        "label": "Xã Thanh Mỹ"
      },
      {
        "id": "ward_28444",
        "label": "Xã Thạnh Phú"
      },
      {
        "id": "ward_30037",
        "label": "Xã Tháp Mười"
      },
      {
        "id": "ward_29971",
        "label": "Xã Thường Phước"
      },
      {
        "id": "ward_30001",
        "label": "Xã Tràm Chim"
      },
      {
        "id": "ward_30046",
        "label": "Xã Trường Xuân"
      },
      {
        "id": "ward_28651",
        "label": "Xã Vĩnh Bình"
      },
      {
        "id": "ward_28678",
        "label": "Xã Vĩnh Hựu"
      },
      {
        "id": "ward_28576",
        "label": "Xã Vĩnh Kim"
      }
    ]
  },
  {
    "id": "gia_lai",
    "label": "Gia Lai",
    "wards": [
      {
        "id": "ward_23614",
        "label": "Phường An Bình"
      },
      {
        "id": "ward_23617",
        "label": "Phường An Khê"
      },
      {
        "id": "ward_21910",
        "label": "Phường An Nhơn"
      },
      {
        "id": "ward_21925",
        "label": "Phường An Nhơn Bắc"
      },
      {
        "id": "ward_21934",
        "label": "Phường An Nhơn Đông"
      },
      {
        "id": "ward_21943",
        "label": "Phường An Nhơn Nam"
      },
      {
        "id": "ward_23602",
        "label": "Phường An Phú"
      },
      {
        "id": "ward_24044",
        "label": "Phường Ayun Pa"
      },
      {
        "id": "ward_21907",
        "label": "Phường Bình Định"
      },
      {
        "id": "ward_21640",
        "label": "Phường Bồng Sơn"
      },
      {
        "id": "ward_23563",
        "label": "Phường Diên Hồng"
      },
      {
        "id": "ward_21664",
        "label": "Phường Hoài Nhơn"
      },
      {
        "id": "ward_21655",
        "label": "Phường Hoài Nhơn Bắc"
      },
      {
        "id": "ward_21670",
        "label": "Phường Hoài Nhơn Đông"
      },
      {
        "id": "ward_21673",
        "label": "Phường Hoài Nhơn Nam"
      },
      {
        "id": "ward_21661",
        "label": "Phường Hoài Nhơn Tây"
      },
      {
        "id": "ward_23586",
        "label": "Phường Hội Phú"
      },
      {
        "id": "ward_23575",
        "label": "Phường Pleiku"
      },
      {
        "id": "ward_21583",
        "label": "Phường Quy Nhơn"
      },
      {
        "id": "ward_21553",
        "label": "Phường Quy Nhơn Bắc"
      },
      {
        "id": "ward_21601",
        "label": "Phường Quy Nhơn Đông"
      },
      {
        "id": "ward_21592",
        "label": "Phường Quy Nhơn Nam"
      },
      {
        "id": "ward_21589",
        "label": "Phường Quy Nhơn Tây"
      },
      {
        "id": "ward_21637",
        "label": "Phường Tam Quan"
      },
      {
        "id": "ward_23584",
        "label": "Phường Thống Nhất"
      },
      {
        "id": "ward_23954",
        "label": "Xã Al Bá"
      },
      {
        "id": "ward_21628",
        "label": "Xã An Hòa"
      },
      {
        "id": "ward_21609",
        "label": "Xã An Lão"
      },
      {
        "id": "ward_21769",
        "label": "Xã An Lương"
      },
      {
        "id": "ward_21940",
        "label": "Xã An Nhơn Tây"
      },
      {
        "id": "ward_21622",
        "label": "Xã An Toàn"
      },
      {
        "id": "ward_21616",
        "label": "Xã An Vinh"
      },
      {
        "id": "ward_23798",
        "label": "Xã Ayun"
      },
      {
        "id": "ward_21697",
        "label": "Xã Ân Hảo"
      },
      {
        "id": "ward_21715",
        "label": "Xã Ân Tường"
      },
      {
        "id": "ward_23896",
        "label": "Xã Bàu Cạn"
      },
      {
        "id": "ward_23590",
        "label": "Xã Biển Hồ"
      },
      {
        "id": "ward_21829",
        "label": "Xã Bình An"
      },
      {
        "id": "ward_21733",
        "label": "Xã Bình Dương"
      },
      {
        "id": "ward_21817",
        "label": "Xã Bình Hiệp"
      },
      {
        "id": "ward_21820",
        "label": "Xã Bình Khê"
      },
      {
        "id": "ward_21835",
        "label": "Xã Bình Phú"
      },
      {
        "id": "ward_23947",
        "label": "Xã Bờ Ngoong"
      },
      {
        "id": "ward_21997",
        "label": "Xã Canh Liên"
      },
      {
        "id": "ward_22006",
        "label": "Xã Canh Vinh"
      },
      {
        "id": "ward_21880",
        "label": "Xã Cát Tiến"
      },
      {
        "id": "ward_23851",
        "label": "Xã Chơ Long"
      },
      {
        "id": "ward_24049",
        "label": "Xã Chư A Thai"
      },
      {
        "id": "ward_23830",
        "label": "Xã Chư Krey"
      },
      {
        "id": "ward_23722",
        "label": "Xã Chư Păh"
      },
      {
        "id": "ward_23887",
        "label": "Xã Chư Prông"
      },
      {
        "id": "ward_23942",
        "label": "Xã Chư Pưh"
      },
      {
        "id": "ward_23941",
        "label": "Xã Chư Sê"
      },
      {
        "id": "ward_23629",
        "label": "Xã Cửu An"
      },
      {
        "id": "ward_23677",
        "label": "Xã Đak Đoa"
      },
      {
        "id": "ward_23995",
        "label": "Xã Đak Pơ"
      },
      {
        "id": "ward_23644",
        "label": "Xã Đak Rong"
      },
      {
        "id": "ward_23683",
        "label": "Xã Đak Sơmei"
      },
      {
        "id": "ward_23842",
        "label": "Xã Đăk Song"
      },
      {
        "id": "ward_21859",
        "label": "Xã Đề Gi"
      },
      {
        "id": "ward_23857",
        "label": "Xã Đức Cơ"
      },
      {
        "id": "ward_23611",
        "label": "Xã Gào"
      },
      {
        "id": "ward_21871",
        "label": "Xã Hòa Hội"
      },
      {
        "id": "ward_21688",
        "label": "Xã Hoài Ân"
      },
      {
        "id": "ward_21868",
        "label": "Xã Hội Sơn"
      },
      {
        "id": "ward_23799",
        "label": "Xã Hra"
      },
      {
        "id": "ward_23710",
        "label": "Xã Ia Băng"
      },
      {
        "id": "ward_23911",
        "label": "Xã Ia Boòng"
      },
      {
        "id": "ward_23788",
        "label": "Xã Ia Chia"
      },
      {
        "id": "ward_23872",
        "label": "Xã Ia Dom"
      },
      {
        "id": "ward_23869",
        "label": "Xã Ia Dơk"
      },
      {
        "id": "ward_24100",
        "label": "Xã Ia Dreh"
      },
      {
        "id": "ward_23764",
        "label": "Xã Ia Grai"
      },
      {
        "id": "ward_24061",
        "label": "Xã Ia Hiao"
      },
      {
        "id": "ward_23971",
        "label": "Xã Ia Hrú"
      },
      {
        "id": "ward_23767",
        "label": "Xã Ia Hrung"
      },
      {
        "id": "ward_23728",
        "label": "Xã Ia Khươl"
      },
      {
        "id": "ward_23977",
        "label": "Xã Ia Ko"
      },
      {
        "id": "ward_23776",
        "label": "Xã Ia Krái"
      },
      {
        "id": "ward_23866",
        "label": "Xã Ia Krêl"
      },
      {
        "id": "ward_23935",
        "label": "Xã Ia Lâu"
      },
      {
        "id": "ward_23986",
        "label": "Xã Ia Le"
      },
      {
        "id": "ward_23734",
        "label": "Xã Ia Ly"
      },
      {
        "id": "ward_23737",
        "label": "Xã Ia Mơ"
      },
      {
        "id": "ward_23884",
        "label": "Xã Ia Nan"
      },
      {
        "id": "ward_23782",
        "label": "Xã Ia O"
      },
      {
        "id": "ward_24022",
        "label": "Xã Ia Pa"
      },
      {
        "id": "ward_23749",
        "label": "Xã Ia Phí"
      },
      {
        "id": "ward_23926",
        "label": "Xã Ia Pia"
      },
      {
        "id": "ward_23881",
        "label": "Xã Ia Pnôn"
      },
      {
        "id": "ward_23917",
        "label": "Xã Ia Púch"
      },
      {
        "id": "ward_24065",
        "label": "Xã Ia Rbol"
      },
      {
        "id": "ward_24112",
        "label": "Xã Ia Rsai"
      },
      {
        "id": "ward_24073",
        "label": "Xã Ia Sao"
      },
      {
        "id": "ward_23908",
        "label": "Xã Ia Tôr"
      },
      {
        "id": "ward_24028",
        "label": "Xã Ia Tul"
      },
      {
        "id": "ward_23638",
        "label": "Xã Kbang"
      },
      {
        "id": "ward_23714",
        "label": "Xã KDang"
      },
      {
        "id": "ward_21727",
        "label": "Xã Kim Sơn"
      },
      {
        "id": "ward_23818",
        "label": "Xã Kon Chiêng"
      },
      {
        "id": "ward_23701",
        "label": "Xã Kon Gang"
      },
      {
        "id": "ward_23674",
        "label": "Xã Kông Bơ La"
      },
      {
        "id": "ward_23824",
        "label": "Xã Kông Chro"
      },
      {
        "id": "ward_23650",
        "label": "Xã Krong"
      },
      {
        "id": "ward_23812",
        "label": "Xã Lơ Pang"
      },
      {
        "id": "ward_23794",
        "label": "Xã Mang Yang"
      },
      {
        "id": "ward_21901",
        "label": "Xã Ngô Mây"
      },
      {
        "id": "ward_21607",
        "label": "Xã Nhơn Châu"
      },
      {
        "id": "ward_21853",
        "label": "Xã Phù Cát"
      },
      {
        "id": "ward_21730",
        "label": "Xã Phù Mỹ"
      },
      {
        "id": "ward_21739",
        "label": "Xã Phù Mỹ Bắc"
      },
      {
        "id": "ward_21751",
        "label": "Xã Phù Mỹ Đông"
      },
      {
        "id": "ward_21775",
        "label": "Xã Phù Mỹ Nam"
      },
      {
        "id": "ward_21757",
        "label": "Xã Phù Mỹ Tây"
      },
      {
        "id": "ward_24043",
        "label": "Xã Phú Thiện"
      },
      {
        "id": "ward_24076",
        "label": "Xã Phú Túc"
      },
      {
        "id": "ward_24013",
        "label": "Xã Pờ Tó"
      },
      {
        "id": "ward_23647",
        "label": "Xã Sơn Lang"
      },
      {
        "id": "ward_23839",
        "label": "Xã SRó"
      },
      {
        "id": "ward_21808",
        "label": "Xã Tây Sơn"
      },
      {
        "id": "ward_23668",
        "label": "Xã Tơ Tung"
      },
      {
        "id": "ward_21952",
        "label": "Xã Tuy Phước"
      },
      {
        "id": "ward_21964",
        "label": "Xã Tuy Phước Bắc"
      },
      {
        "id": "ward_21970",
        "label": "Xã Tuy Phước Đông"
      },
      {
        "id": "ward_21985",
        "label": "Xã Tuy Phước Tây"
      },
      {
        "id": "ward_24109",
        "label": "Xã Uar"
      },
      {
        "id": "ward_21703",
        "label": "Xã Vạn Đức"
      },
      {
        "id": "ward_21994",
        "label": "Xã Vân Canh"
      },
      {
        "id": "ward_21805",
        "label": "Xã Vĩnh Quang"
      },
      {
        "id": "ward_21787",
        "label": "Xã Vĩnh Sơn"
      },
      {
        "id": "ward_21786",
        "label": "Xã Vĩnh Thạnh"
      },
      {
        "id": "ward_21796",
        "label": "Xã Vĩnh Thịnh"
      },
      {
        "id": "ward_21892",
        "label": "Xã Xuân An"
      },
      {
        "id": "ward_24007",
        "label": "Xã Ya Hội"
      },
      {
        "id": "ward_23833",
        "label": "Xã Ya Ma"
      }
    ]
  },
  {
    "id": "ha_noi",
    "label": "Hà Nội",
    "wards": [
      {
        "id": "ward_00004",
        "label": "Phường Ba Đình"
      },
      {
        "id": "ward_00292",
        "label": "Phường Bạch Mai"
      },
      {
        "id": "ward_00118",
        "label": "Phường Bồ Đề"
      },
      {
        "id": "ward_00166",
        "label": "Phường Cầu Giấy"
      },
      {
        "id": "ward_10015",
        "label": "Phường Chương Mỹ"
      },
      {
        "id": "ward_00082",
        "label": "Phường Cửa Nam"
      },
      {
        "id": "ward_09886",
        "label": "Phường Dương Nội"
      },
      {
        "id": "ward_00637",
        "label": "Phường Đại Mỗ"
      },
      {
        "id": "ward_00316",
        "label": "Phường Định Công"
      },
      {
        "id": "ward_00235",
        "label": "Phường Đống Đa"
      },
      {
        "id": "ward_00602",
        "label": "Phường Đông Ngạc"
      },
      {
        "id": "ward_00025",
        "label": "Phường Giảng Võ"
      },
      {
        "id": "ward_09556",
        "label": "Phường Hà Đông"
      },
      {
        "id": "ward_00256",
        "label": "Phường Hai Bà Trưng"
      },
      {
        "id": "ward_00070",
        "label": "Phường Hoàn Kiếm"
      },
      {
        "id": "ward_00337",
        "label": "Phường Hoàng Liệt"
      },
      {
        "id": "ward_00331",
        "label": "Phường Hoàng Mai"
      },
      {
        "id": "ward_00097",
        "label": "Phường Hồng Hà"
      },
      {
        "id": "ward_00364",
        "label": "Phường Khương Đình"
      },
      {
        "id": "ward_09552",
        "label": "Phường Kiến Hưng"
      },
      {
        "id": "ward_00229",
        "label": "Phường Kim Liên"
      },
      {
        "id": "ward_00199",
        "label": "Phường Láng"
      },
      {
        "id": "ward_00328",
        "label": "Phường Lĩnh Nam"
      },
      {
        "id": "ward_00145",
        "label": "Phường Long Biên"
      },
      {
        "id": "ward_00160",
        "label": "Phường Nghĩa Đô"
      },
      {
        "id": "ward_00008",
        "label": "Phường Ngọc Hà"
      },
      {
        "id": "ward_00190",
        "label": "Phường Ô Chợ Dừa"
      },
      {
        "id": "ward_00619",
        "label": "Phường Phú Diễn"
      },
      {
        "id": "ward_09568",
        "label": "Phường Phú Lương"
      },
      {
        "id": "ward_00091",
        "label": "Phường Phú Thượng"
      },
      {
        "id": "ward_00136",
        "label": "Phường Phúc Lợi"
      },
      {
        "id": "ward_00352",
        "label": "Phường Phương Liệt"
      },
      {
        "id": "ward_09574",
        "label": "Phường Sơn Tây"
      },
      {
        "id": "ward_00103",
        "label": "Phường Tây Hồ"
      },
      {
        "id": "ward_00634",
        "label": "Phường Tây Mỗ"
      },
      {
        "id": "ward_00613",
        "label": "Phường Tây Tựu"
      },
      {
        "id": "ward_00643",
        "label": "Phường Thanh Liệt"
      },
      {
        "id": "ward_00367",
        "label": "Phường Thanh Xuân"
      },
      {
        "id": "ward_00598",
        "label": "Phường Thượng Cát"
      },
      {
        "id": "ward_09604",
        "label": "Phường Tùng Thiện"
      },
      {
        "id": "ward_00592",
        "label": "Phường Từ Liêm"
      },
      {
        "id": "ward_00322",
        "label": "Phường Tương Mai"
      },
      {
        "id": "ward_00226",
        "label": "Phường Văn Miếu - Quốc Tử Giám"
      },
      {
        "id": "ward_00127",
        "label": "Phường Việt Hưng"
      },
      {
        "id": "ward_00301",
        "label": "Phường Vĩnh Hưng"
      },
      {
        "id": "ward_00283",
        "label": "Phường Vĩnh Tuy"
      },
      {
        "id": "ward_00611",
        "label": "Phường Xuân Đỉnh"
      },
      {
        "id": "ward_00622",
        "label": "Phường Xuân Phương"
      },
      {
        "id": "ward_00175",
        "label": "Phường Yên Hòa"
      },
      {
        "id": "ward_09562",
        "label": "Phường Yên Nghĩa"
      },
      {
        "id": "ward_00340",
        "label": "Phường Yên Sở"
      },
      {
        "id": "ward_09877",
        "label": "Xã An Khánh"
      },
      {
        "id": "ward_09700",
        "label": "Xã Ba Vì"
      },
      {
        "id": "ward_00577",
        "label": "Xã Bát Tràng"
      },
      {
        "id": "ward_09676",
        "label": "Xã Bất Bạt"
      },
      {
        "id": "ward_10126",
        "label": "Xã Bình Minh"
      },
      {
        "id": "ward_10330",
        "label": "Xã Chuyên Mỹ"
      },
      {
        "id": "ward_10237",
        "label": "Xã Chương Dương"
      },
      {
        "id": "ward_09634",
        "label": "Xã Cổ Đô"
      },
      {
        "id": "ward_10180",
        "label": "Xã Dân Hòa"
      },
      {
        "id": "ward_09856",
        "label": "Xã Dương Hòa"
      },
      {
        "id": "ward_00430",
        "label": "Xã Đa Phúc"
      },
      {
        "id": "ward_00664",
        "label": "Xã Đại Thanh"
      },
      {
        "id": "ward_10342",
        "label": "Xã Đại Xuyên"
      },
      {
        "id": "ward_09784",
        "label": "Xã Đan Phượng"
      },
      {
        "id": "ward_09616",
        "label": "Xã Đoài Phương"
      },
      {
        "id": "ward_00454",
        "label": "Xã Đông Anh"
      },
      {
        "id": "ward_00565",
        "label": "Xã Gia Lâm"
      },
      {
        "id": "ward_09982",
        "label": "Xã Hạ Bằng"
      },
      {
        "id": "ward_09772",
        "label": "Xã Hát Môn"
      },
      {
        "id": "ward_09988",
        "label": "Xã Hòa Lạc"
      },
      {
        "id": "ward_10096",
        "label": "Xã Hòa Phú"
      },
      {
        "id": "ward_10417",
        "label": "Xã Hòa Xá"
      },
      {
        "id": "ward_09832",
        "label": "Xã Hoài Đức"
      },
      {
        "id": "ward_10465",
        "label": "Xã Hồng Sơn"
      },
      {
        "id": "ward_10210",
        "label": "Xã Hồng Vân"
      },
      {
        "id": "ward_09931",
        "label": "Xã Hưng Đạo"
      },
      {
        "id": "ward_10489",
        "label": "Xã Hương Sơn"
      },
      {
        "id": "ward_09910",
        "label": "Xã Kiều Phú"
      },
      {
        "id": "ward_00382",
        "label": "Xã Kim Anh"
      },
      {
        "id": "ward_09787",
        "label": "Xã Liên Minh"
      },
      {
        "id": "ward_09022",
        "label": "Xã Mê Linh"
      },
      {
        "id": "ward_09661",
        "label": "Xã Minh Châu"
      },
      {
        "id": "ward_10441",
        "label": "Xã Mỹ Đức"
      },
      {
        "id": "ward_00685",
        "label": "Xã Nam Phù"
      },
      {
        "id": "ward_00679",
        "label": "Xã Ngọc Hồi"
      },
      {
        "id": "ward_00433",
        "label": "Xã Nội Bài"
      },
      {
        "id": "ward_09817",
        "label": "Xã Ô Diên"
      },
      {
        "id": "ward_09952",
        "label": "Xã Phú Cát"
      },
      {
        "id": "ward_00541",
        "label": "Xã Phù Đổng"
      },
      {
        "id": "ward_10030",
        "label": "Xã Phú Nghĩa"
      },
      {
        "id": "ward_10273",
        "label": "Xã Phú Xuyên"
      },
      {
        "id": "ward_09739",
        "label": "Xã Phúc Lộc"
      },
      {
        "id": "ward_10459",
        "label": "Xã Phúc Sơn"
      },
      {
        "id": "ward_00466",
        "label": "Xã Phúc Thịnh"
      },
      {
        "id": "ward_09715",
        "label": "Xã Phúc Thọ"
      },
      {
        "id": "ward_10279",
        "label": "Xã Phượng Dực"
      },
      {
        "id": "ward_10072",
        "label": "Xã Quảng Bị"
      },
      {
        "id": "ward_08974",
        "label": "Xã Quang Minh"
      },
      {
        "id": "ward_09619",
        "label": "Xã Quảng Oai"
      },
      {
        "id": "ward_09895",
        "label": "Xã Quốc Oai"
      },
      {
        "id": "ward_00376",
        "label": "Xã Sóc Sơn"
      },
      {
        "id": "ward_09871",
        "label": "Xã Sơn Đồng"
      },
      {
        "id": "ward_09694",
        "label": "Xã Suối Hai"
      },
      {
        "id": "ward_10144",
        "label": "Xã Tam Hưng"
      },
      {
        "id": "ward_10003",
        "label": "Xã Tây Phương"
      },
      {
        "id": "ward_09955",
        "label": "Xã Thạch Thất"
      },
      {
        "id": "ward_10114",
        "label": "Xã Thanh Oai"
      },
      {
        "id": "ward_00640",
        "label": "Xã Thanh Trì"
      },
      {
        "id": "ward_00493",
        "label": "Xã Thiên Lộc"
      },
      {
        "id": "ward_00562",
        "label": "Xã Thuận An"
      },
      {
        "id": "ward_00475",
        "label": "Xã Thư Lâm"
      },
      {
        "id": "ward_10231",
        "label": "Xã Thượng Phúc"
      },
      {
        "id": "ward_10183",
        "label": "Xã Thường Tín"
      },
      {
        "id": "ward_08995",
        "label": "Xã Tiến Thắng"
      },
      {
        "id": "ward_10081",
        "label": "Xã Trần Phú"
      },
      {
        "id": "ward_00385",
        "label": "Xã Trung Giã"
      },
      {
        "id": "ward_10402",
        "label": "Xã Ứng Hòa"
      },
      {
        "id": "ward_10369",
        "label": "Xã Ứng Thiên"
      },
      {
        "id": "ward_10354",
        "label": "Xã Vân Đình"
      },
      {
        "id": "ward_09664",
        "label": "Xã Vật Lại"
      },
      {
        "id": "ward_00508",
        "label": "Xã Vĩnh Thanh"
      },
      {
        "id": "ward_10045",
        "label": "Xã Xuân Mai"
      },
      {
        "id": "ward_09706",
        "label": "Xã Yên Bài"
      },
      {
        "id": "ward_08980",
        "label": "Xã Yên Lãng"
      },
      {
        "id": "ward_04930",
        "label": "Xã Yên Xuân"
      }
    ]
  },
  {
    "id": "ha_tinh",
    "label": "Hà Tĩnh",
    "wards": [
      {
        "id": "ward_18115",
        "label": "Phường Bắc Hồng Lĩnh"
      },
      {
        "id": "ward_18652",
        "label": "Phường Hà Huy Tập"
      },
      {
        "id": "ward_18781",
        "label": "Phường Hải Ninh"
      },
      {
        "id": "ward_18832",
        "label": "Phường Hoành Sơn"
      },
      {
        "id": "ward_18118",
        "label": "Phường Nam Hồng Lĩnh"
      },
      {
        "id": "ward_18754",
        "label": "Phường Sông Trí"
      },
      {
        "id": "ward_18073",
        "label": "Phường Thành Sen"
      },
      {
        "id": "ward_18100",
        "label": "Phường Trần Phú"
      },
      {
        "id": "ward_18823",
        "label": "Phường Vũng Áng"
      },
      {
        "id": "ward_18406",
        "label": "Xã Can Lộc"
      },
      {
        "id": "ward_18685",
        "label": "Xã Cẩm Bình"
      },
      {
        "id": "ward_18739",
        "label": "Xã Cẩm Duệ"
      },
      {
        "id": "ward_18736",
        "label": "Xã Cẩm Hưng"
      },
      {
        "id": "ward_18748",
        "label": "Xã Cẩm Lạc"
      },
      {
        "id": "ward_18742",
        "label": "Xã Cẩm Trung"
      },
      {
        "id": "ward_18673",
        "label": "Xã Cẩm Xuyên"
      },
      {
        "id": "ward_18394",
        "label": "Xã Cổ Đạm"
      },
      {
        "id": "ward_18364",
        "label": "Xã Đan Hải"
      },
      {
        "id": "ward_18586",
        "label": "Xã Đông Kinh"
      },
      {
        "id": "ward_18484",
        "label": "Xã Đồng Lộc"
      },
      {
        "id": "ward_18619",
        "label": "Xã Đồng Tiến"
      },
      {
        "id": "ward_18304",
        "label": "Xã Đức Đồng"
      },
      {
        "id": "ward_18244",
        "label": "Xã Đức Minh"
      },
      {
        "id": "ward_18262",
        "label": "Xã Đức Quang"
      },
      {
        "id": "ward_18277",
        "label": "Xã Đức Thịnh"
      },
      {
        "id": "ward_18229",
        "label": "Xã Đức Thọ"
      },
      {
        "id": "ward_18466",
        "label": "Xã Gia Hanh"
      },
      {
        "id": "ward_18502",
        "label": "Xã Hà Linh"
      },
      {
        "id": "ward_18409",
        "label": "Xã Hồng Lộc"
      },
      {
        "id": "ward_18523",
        "label": "Xã Hương Bình"
      },
      {
        "id": "ward_18550",
        "label": "Xã Hương Đô"
      },
      {
        "id": "ward_18496",
        "label": "Xã Hương Khê"
      },
      {
        "id": "ward_18532",
        "label": "Xã Hương Phố"
      },
      {
        "id": "ward_18133",
        "label": "Xã Hương Sơn"
      },
      {
        "id": "ward_18544",
        "label": "Xã Hương Xuân"
      },
      {
        "id": "ward_18223",
        "label": "Xã Kim Hoa"
      },
      {
        "id": "ward_18775",
        "label": "Xã Kỳ Anh"
      },
      {
        "id": "ward_18814",
        "label": "Xã Kỳ Hoa"
      },
      {
        "id": "ward_18790",
        "label": "Xã Kỳ Khang"
      },
      {
        "id": "ward_18838",
        "label": "Xã Kỳ Lạc"
      },
      {
        "id": "ward_18844",
        "label": "Xã Kỳ Thượng"
      },
      {
        "id": "ward_18787",
        "label": "Xã Kỳ Văn"
      },
      {
        "id": "ward_18766",
        "label": "Xã Kỳ Xuân"
      },
      {
        "id": "ward_18568",
        "label": "Xã Lộc Hà"
      },
      {
        "id": "ward_18322",
        "label": "Xã Mai Hoa"
      },
      {
        "id": "ward_18583",
        "label": "Xã Mai Phụ"
      },
      {
        "id": "ward_18352",
        "label": "Xã Nghi Xuân"
      },
      {
        "id": "ward_18547",
        "label": "Xã Phúc Trạch"
      },
      {
        "id": "ward_18184",
        "label": "Xã Sơn Giang"
      },
      {
        "id": "ward_18160",
        "label": "Xã Sơn Hồng"
      },
      {
        "id": "ward_18196",
        "label": "Xã Sơn Kim 1"
      },
      {
        "id": "ward_18199",
        "label": "Xã Sơn Kim 2"
      },
      {
        "id": "ward_18172",
        "label": "Xã Sơn Tây"
      },
      {
        "id": "ward_18163",
        "label": "Xã Sơn Tiến"
      },
      {
        "id": "ward_18562",
        "label": "Xã Thạch Hà"
      },
      {
        "id": "ward_18604",
        "label": "Xã Thạch Khê"
      },
      {
        "id": "ward_18628",
        "label": "Xã Thạch Lạc"
      },
      {
        "id": "ward_18667",
        "label": "Xã Thạch Xuân"
      },
      {
        "id": "ward_18676",
        "label": "Xã Thiên Cầm"
      },
      {
        "id": "ward_18328",
        "label": "Xã Thượng Đức"
      },
      {
        "id": "ward_18373",
        "label": "Xã Tiên Điền"
      },
      {
        "id": "ward_18634",
        "label": "Xã Toàn Lưu"
      },
      {
        "id": "ward_18436",
        "label": "Xã Trường Lưu"
      },
      {
        "id": "ward_18418",
        "label": "Xã Tùng Lộc"
      },
      {
        "id": "ward_18202",
        "label": "Xã Tứ Mỹ"
      },
      {
        "id": "ward_18601",
        "label": "Xã Việt Xuyên"
      },
      {
        "id": "ward_18313",
        "label": "Xã Vũ Quang"
      },
      {
        "id": "ward_18481",
        "label": "Xã Xuân Lộc"
      },
      {
        "id": "ward_18682",
        "label": "Xã Yên Hòa"
      }
    ]
  },
  {
    "id": "hai_phong",
    "label": "Hải Phòng",
    "wards": [
      {
        "id": "ward_11948",
        "label": "Đặc khu Bạch Long Vĩ"
      },
      {
        "id": "ward_11914",
        "label": "Đặc khu Cát Hải"
      },
      {
        "id": "ward_10660",
        "label": "Phường Ái Quốc"
      },
      {
        "id": "ward_11407",
        "label": "Phường An Biên"
      },
      {
        "id": "ward_11581",
        "label": "Phường An Dương"
      },
      {
        "id": "ward_11617",
        "label": "Phường An Hải"
      },
      {
        "id": "ward_11593",
        "label": "Phường An Phong"
      },
      {
        "id": "ward_11473",
        "label": "Phường Bạch Đằng"
      },
      {
        "id": "ward_10678",
        "label": "Phường Bắc An Phụ"
      },
      {
        "id": "ward_10546",
        "label": "Phường Chí Linh"
      },
      {
        "id": "ward_10549",
        "label": "Phường Chu Văn An"
      },
      {
        "id": "ward_11692",
        "label": "Phường Dương Kinh"
      },
      {
        "id": "ward_11455",
        "label": "Phường Đồ Sơn"
      },
      {
        "id": "ward_11411",
        "label": "Phường Đông Hải"
      },
      {
        "id": "ward_11359",
        "label": "Phường Gia Viên"
      },
      {
        "id": "ward_11413",
        "label": "Phường Hải An"
      },
      {
        "id": "ward_10525",
        "label": "Phường Hải Dương"
      },
      {
        "id": "ward_11533",
        "label": "Phường Hòa Bình"
      },
      {
        "id": "ward_11602",
        "label": "Phường Hồng An"
      },
      {
        "id": "ward_11311",
        "label": "Phường Hồng Bàng"
      },
      {
        "id": "ward_11689",
        "label": "Phường Hưng Đạo"
      },
      {
        "id": "ward_11443",
        "label": "Phường Kiến An"
      },
      {
        "id": "ward_10675",
        "label": "Phường Kinh Môn"
      },
      {
        "id": "ward_11383",
        "label": "Phường Lê Chân"
      },
      {
        "id": "ward_10603",
        "label": "Phường Lê Đại Hành"
      },
      {
        "id": "ward_11506",
        "label": "Phường Lê Ích Mộc"
      },
      {
        "id": "ward_10532",
        "label": "Phường Lê Thanh Nghị"
      },
      {
        "id": "ward_11488",
        "label": "Phường Lưu Kiếm"
      },
      {
        "id": "ward_11737",
        "label": "Phường Nam Đồ Sơn"
      },
      {
        "id": "ward_10837",
        "label": "Phường Nam Đồng"
      },
      {
        "id": "ward_11542",
        "label": "Phường Nam Triệu"
      },
      {
        "id": "ward_11329",
        "label": "Phường Ngô Quyền"
      },
      {
        "id": "ward_10744",
        "label": "Phường Nguyễn Đại Năng"
      },
      {
        "id": "ward_10552",
        "label": "Phường Nguyễn Trãi"
      },
      {
        "id": "ward_10714",
        "label": "Phường Nhị Chiểu"
      },
      {
        "id": "ward_10726",
        "label": "Phường Phạm Sư Mạnh"
      },
      {
        "id": "ward_11446",
        "label": "Phường Phù Liễn"
      },
      {
        "id": "ward_10537",
        "label": "Phường Tân Hưng"
      },
      {
        "id": "ward_11002",
        "label": "Phường Thạch Khôi"
      },
      {
        "id": "ward_10507",
        "label": "Phường Thành Đông"
      },
      {
        "id": "ward_11557",
        "label": "Phường Thiên Hương"
      },
      {
        "id": "ward_11560",
        "label": "Phường Thủy Nguyên"
      },
      {
        "id": "ward_10570",
        "label": "Phường Trần Hưng Đạo"
      },
      {
        "id": "ward_10729",
        "label": "Phường Trần Liễu"
      },
      {
        "id": "ward_10573",
        "label": "Phường Trần Nhân Tông"
      },
      {
        "id": "ward_10891",
        "label": "Phường Tứ Minh"
      },
      {
        "id": "ward_10543",
        "label": "Phường Việt Hòa"
      },
      {
        "id": "ward_11674",
        "label": "Xã An Hưng"
      },
      {
        "id": "ward_11668",
        "label": "Xã An Khánh"
      },
      {
        "id": "ward_11629",
        "label": "Xã An Lão"
      },
      {
        "id": "ward_10645",
        "label": "Xã An Phú"
      },
      {
        "id": "ward_11647",
        "label": "Xã An Quang"
      },
      {
        "id": "ward_10792",
        "label": "Xã An Thành"
      },
      {
        "id": "ward_11635",
        "label": "Xã An Trường"
      },
      {
        "id": "ward_11254",
        "label": "Xã Bắc Thanh Miện"
      },
      {
        "id": "ward_10966",
        "label": "Xã Bình Giang"
      },
      {
        "id": "ward_10888",
        "label": "Xã Cẩm Giang"
      },
      {
        "id": "ward_10903",
        "label": "Xã Cẩm Giàng"
      },
      {
        "id": "ward_11806",
        "label": "Xã Chấn Hưng"
      },
      {
        "id": "ward_11131",
        "label": "Xã Chí Minh"
      },
      {
        "id": "ward_11086",
        "label": "Xã Đại Sơn"
      },
      {
        "id": "ward_10972",
        "label": "Xã Đường An"
      },
      {
        "id": "ward_10999",
        "label": "Xã Gia Lộc"
      },
      {
        "id": "ward_11050",
        "label": "Xã Gia Phúc"
      },
      {
        "id": "ward_10816",
        "label": "Xã Hà Bắc"
      },
      {
        "id": "ward_10882",
        "label": "Xã Hà Đông"
      },
      {
        "id": "ward_10843",
        "label": "Xã Hà Nam"
      },
      {
        "id": "ward_10846",
        "label": "Xã Hà Tây"
      },
      {
        "id": "ward_11257",
        "label": "Xã Hải Hưng"
      },
      {
        "id": "ward_11218",
        "label": "Xã Hồng Châu"
      },
      {
        "id": "ward_10615",
        "label": "Xã Hợp Tiến"
      },
      {
        "id": "ward_11809",
        "label": "Xã Hùng Thắng"
      },
      {
        "id": "ward_10945",
        "label": "Xã Kẻ Sặt"
      },
      {
        "id": "ward_11224",
        "label": "Xã Khúc Thừa Dụ"
      },
      {
        "id": "ward_11749",
        "label": "Xã Kiến Hải"
      },
      {
        "id": "ward_11728",
        "label": "Xã Kiến Hưng"
      },
      {
        "id": "ward_11725",
        "label": "Xã Kiến Minh"
      },
      {
        "id": "ward_11680",
        "label": "Xã Kiến Thụy"
      },
      {
        "id": "ward_10804",
        "label": "Xã Kim Thành"
      },
      {
        "id": "ward_11140",
        "label": "Xã Lạc Phượng"
      },
      {
        "id": "ward_10756",
        "label": "Xã Lai Khê"
      },
      {
        "id": "ward_10930",
        "label": "Xã Mao Điền"
      },
      {
        "id": "ward_10705",
        "label": "Xã Nam An Phụ"
      },
      {
        "id": "ward_10606",
        "label": "Xã Nam Sách"
      },
      {
        "id": "ward_11284",
        "label": "Xã Nam Thanh Miện"
      },
      {
        "id": "ward_11713",
        "label": "Xã Nghi Dương"
      },
      {
        "id": "ward_11911",
        "label": "Xã Nguyễn Bỉnh Khiêm"
      },
      {
        "id": "ward_11146",
        "label": "Xã Nguyên Giáp"
      },
      {
        "id": "ward_11242",
        "label": "Xã Nguyễn Lương Bằng"
      },
      {
        "id": "ward_11203",
        "label": "Xã Ninh Giang"
      },
      {
        "id": "ward_10750",
        "label": "Xã Phú Thái"
      },
      {
        "id": "ward_11761",
        "label": "Xã Quyết Thắng"
      },
      {
        "id": "ward_11167",
        "label": "Xã Tân An"
      },
      {
        "id": "ward_11113",
        "label": "Xã Tân Kỳ"
      },
      {
        "id": "ward_11779",
        "label": "Xã Tân Minh"
      },
      {
        "id": "ward_10642",
        "label": "Xã Thái Tân"
      },
      {
        "id": "ward_10813",
        "label": "Xã Thanh Hà"
      },
      {
        "id": "ward_11239",
        "label": "Xã Thanh Miện"
      },
      {
        "id": "ward_10993",
        "label": "Xã Thượng Hồng"
      },
      {
        "id": "ward_11755",
        "label": "Xã Tiên Lãng"
      },
      {
        "id": "ward_11791",
        "label": "Xã Tiên Minh"
      },
      {
        "id": "ward_10633",
        "label": "Xã Trần Phú"
      },
      {
        "id": "ward_11065",
        "label": "Xã Trường Tân"
      },
      {
        "id": "ward_10909",
        "label": "Xã Tuệ Tĩnh"
      },
      {
        "id": "ward_11074",
        "label": "Xã Tứ Kỳ"
      },
      {
        "id": "ward_11503",
        "label": "Xã Việt Khê"
      },
      {
        "id": "ward_11887",
        "label": "Xã Vĩnh Am"
      },
      {
        "id": "ward_11824",
        "label": "Xã Vĩnh Bảo"
      },
      {
        "id": "ward_11875",
        "label": "Xã Vĩnh Hải"
      },
      {
        "id": "ward_11848",
        "label": "Xã Vĩnh Hòa"
      },
      {
        "id": "ward_11164",
        "label": "Xã Vĩnh Lại"
      },
      {
        "id": "ward_11836",
        "label": "Xã Vĩnh Thịnh"
      },
      {
        "id": "ward_11842",
        "label": "Xã Vĩnh Thuận"
      },
      {
        "id": "ward_11020",
        "label": "Xã Yết Kiêu"
      }
    ]
  },
  {
    "id": "hue",
    "label": "Huế",
    "wards": [
      {
        "id": "ward_19815",
        "label": "Phường An Cựu"
      },
      {
        "id": "ward_19909",
        "label": "Phường Dương Nỗ"
      },
      {
        "id": "ward_20014",
        "label": "Phường Hóa Châu"
      },
      {
        "id": "ward_19804",
        "label": "Phường Hương An"
      },
      {
        "id": "ward_19975",
        "label": "Phường Hương Thủy"
      },
      {
        "id": "ward_19996",
        "label": "Phường Hương Trà"
      },
      {
        "id": "ward_19774",
        "label": "Phường Kim Long"
      },
      {
        "id": "ward_20017",
        "label": "Phường Kim Trà"
      },
      {
        "id": "ward_19930",
        "label": "Phường Mỹ Thượng"
      },
      {
        "id": "ward_19831",
        "label": "Phường Phong Dinh"
      },
      {
        "id": "ward_19819",
        "label": "Phường Phong Điền"
      },
      {
        "id": "ward_19828",
        "label": "Phường Phong Phú"
      },
      {
        "id": "ward_19873",
        "label": "Phường Phong Quảng"
      },
      {
        "id": "ward_19858",
        "label": "Phường Phong Thái"
      },
      {
        "id": "ward_19960",
        "label": "Phường Phú Bài"
      },
      {
        "id": "ward_19753",
        "label": "Phường Phú Xuân"
      },
      {
        "id": "ward_19969",
        "label": "Phường Thanh Thủy"
      },
      {
        "id": "ward_19900",
        "label": "Phường Thuận An"
      },
      {
        "id": "ward_19789",
        "label": "Phường Thuận Hóa"
      },
      {
        "id": "ward_19813",
        "label": "Phường Thủy Xuân"
      },
      {
        "id": "ward_19777",
        "label": "Phường Vỹ Dạ"
      },
      {
        "id": "ward_20056",
        "label": "Xã A Lưới 1"
      },
      {
        "id": "ward_20044",
        "label": "Xã A Lưới 2"
      },
      {
        "id": "ward_20071",
        "label": "Xã A Lưới 3"
      },
      {
        "id": "ward_20101",
        "label": "Xã A Lưới 4"
      },
      {
        "id": "ward_20050",
        "label": "Xã A Lưới 5"
      },
      {
        "id": "ward_20035",
        "label": "Xã Bình Điền"
      },
      {
        "id": "ward_20137",
        "label": "Xã Chân Mây - Lăng Cô"
      },
      {
        "id": "ward_19885",
        "label": "Xã Đan Điền"
      },
      {
        "id": "ward_20131",
        "label": "Xã Hưng Lộc"
      },
      {
        "id": "ward_20161",
        "label": "Xã Khe Tre"
      },
      {
        "id": "ward_20182",
        "label": "Xã Long Quảng"
      },
      {
        "id": "ward_20140",
        "label": "Xã Lộc An"
      },
      {
        "id": "ward_20179",
        "label": "Xã Nam Đông"
      },
      {
        "id": "ward_19918",
        "label": "Xã Phú Hồ"
      },
      {
        "id": "ward_20107",
        "label": "Xã Phú Lộc"
      },
      {
        "id": "ward_19942",
        "label": "Xã Phú Vang"
      },
      {
        "id": "ward_19945",
        "label": "Xã Phú Vinh"
      },
      {
        "id": "ward_19867",
        "label": "Xã Quảng Điền"
      },
      {
        "id": "ward_20122",
        "label": "Xã Vinh Lộc"
      }
    ]
  },
  {
    "id": "hung_yen",
    "label": "Hưng Yên",
    "wards": [
      {
        "id": "ward_12133",
        "label": "Phường Đường Hào"
      },
      {
        "id": "ward_11980",
        "label": "Phường Hồng Châu"
      },
      {
        "id": "ward_12103",
        "label": "Phường Mỹ Hào"
      },
      {
        "id": "ward_11953",
        "label": "Phường Phố Hiến"
      },
      {
        "id": "ward_11983",
        "label": "Phường Sơn Nam"
      },
      {
        "id": "ward_13225",
        "label": "Phường Thái Bình"
      },
      {
        "id": "ward_12127",
        "label": "Phường Thượng Hồng"
      },
      {
        "id": "ward_12817",
        "label": "Phường Trà Lý"
      },
      {
        "id": "ward_12452",
        "label": "Phường Trần Hưng Đạo"
      },
      {
        "id": "ward_12454",
        "label": "Phường Trần Lãm"
      },
      {
        "id": "ward_12466",
        "label": "Phường Vũ Phúc"
      },
      {
        "id": "ward_12499",
        "label": "Xã A Sào"
      },
      {
        "id": "ward_13021",
        "label": "Xã Ái Quốc"
      },
      {
        "id": "ward_12142",
        "label": "Xã Ân Thi"
      },
      {
        "id": "ward_12694",
        "label": "Xã Bắc Đông Hưng"
      },
      {
        "id": "ward_12745",
        "label": "Xã Bắc Đông Quan"
      },
      {
        "id": "ward_12916",
        "label": "Xã Bắc Thái Ninh"
      },
      {
        "id": "ward_12859",
        "label": "Xã Bắc Thụy Anh"
      },
      {
        "id": "ward_12700",
        "label": "Xã Bắc Tiên Hưng"
      },
      {
        "id": "ward_13186",
        "label": "Xã Bình Định"
      },
      {
        "id": "ward_13096",
        "label": "Xã Bình Nguyên"
      },
      {
        "id": "ward_13183",
        "label": "Xã Bình Thanh"
      },
      {
        "id": "ward_12247",
        "label": "Xã Châu Ninh"
      },
      {
        "id": "ward_12271",
        "label": "Xã Chí Minh"
      },
      {
        "id": "ward_12619",
        "label": "Xã Diên Hà"
      },
      {
        "id": "ward_11995",
        "label": "Xã Đại Đồng"
      },
      {
        "id": "ward_12406",
        "label": "Xã Đoàn Đào"
      },
      {
        "id": "ward_12526",
        "label": "Xã Đồng Bằng"
      },
      {
        "id": "ward_13003",
        "label": "Xã Đồng Châu"
      },
      {
        "id": "ward_12688",
        "label": "Xã Đông Hưng"
      },
      {
        "id": "ward_12793",
        "label": "Xã Đông Quan"
      },
      {
        "id": "ward_12943",
        "label": "Xã Đông Thái Ninh"
      },
      {
        "id": "ward_12862",
        "label": "Xã Đông Thụy Anh"
      },
      {
        "id": "ward_12988",
        "label": "Xã Đông Tiền Hải"
      },
      {
        "id": "ward_12736",
        "label": "Xã Đông Tiên Hưng"
      },
      {
        "id": "ward_12313",
        "label": "Xã Đức Hợp"
      },
      {
        "id": "ward_12322",
        "label": "Xã Hiệp Cường"
      },
      {
        "id": "ward_12070",
        "label": "Xã Hoàn Long"
      },
      {
        "id": "ward_12337",
        "label": "Xã Hoàng Hoa Thám"
      },
      {
        "id": "ward_12685",
        "label": "Xã Hồng Minh"
      },
      {
        "id": "ward_12196",
        "label": "Xã Hồng Quang"
      },
      {
        "id": "ward_13159",
        "label": "Xã Hồng Vũ"
      },
      {
        "id": "ward_12586",
        "label": "Xã Hưng Hà"
      },
      {
        "id": "ward_13066",
        "label": "Xã Hưng Phú"
      },
      {
        "id": "ward_12205",
        "label": "Xã Khoái Châu"
      },
      {
        "id": "ward_13075",
        "label": "Xã Kiến Xương"
      },
      {
        "id": "ward_11992",
        "label": "Xã Lạc Đạo"
      },
      {
        "id": "ward_13120",
        "label": "Xã Lê Lợi"
      },
      {
        "id": "ward_12676",
        "label": "Xã Lê Quý Đôn"
      },
      {
        "id": "ward_12613",
        "label": "Xã Long Hưng"
      },
      {
        "id": "ward_12280",
        "label": "Xã Lương Bằng"
      },
      {
        "id": "ward_12049",
        "label": "Xã Mễ Sở"
      },
      {
        "id": "ward_12511",
        "label": "Xã Minh Thọ"
      },
      {
        "id": "ward_13057",
        "label": "Xã Nam Cường"
      },
      {
        "id": "ward_12775",
        "label": "Xã Nam Đông Hưng"
      },
      {
        "id": "ward_12961",
        "label": "Xã Nam Thái Ninh"
      },
      {
        "id": "ward_12904",
        "label": "Xã Nam Thụy Anh"
      },
      {
        "id": "ward_13063",
        "label": "Xã Nam Tiền Hải"
      },
      {
        "id": "ward_12763",
        "label": "Xã Nam Tiên Hưng"
      },
      {
        "id": "ward_12286",
        "label": "Xã Nghĩa Dân"
      },
      {
        "id": "ward_12031",
        "label": "Xã Nghĩa Trụ"
      },
      {
        "id": "ward_12517",
        "label": "Xã Ngọc Lâm"
      },
      {
        "id": "ward_12532",
        "label": "Xã Nguyễn Du"
      },
      {
        "id": "ward_12184",
        "label": "Xã Nguyễn Trãi"
      },
      {
        "id": "ward_12064",
        "label": "Xã Nguyễn Văn Linh"
      },
      {
        "id": "ward_12595",
        "label": "Xã Ngự Thiên"
      },
      {
        "id": "ward_12004",
        "label": "Xã Như Quỳnh"
      },
      {
        "id": "ward_12148",
        "label": "Xã Phạm Ngũ Lão"
      },
      {
        "id": "ward_12523",
        "label": "Xã Phụ Dực"
      },
      {
        "id": "ward_12025",
        "label": "Xã Phụng Công"
      },
      {
        "id": "ward_12391",
        "label": "Xã Quang Hưng"
      },
      {
        "id": "ward_13132",
        "label": "Xã Quang Lịch"
      },
      {
        "id": "ward_12577",
        "label": "Xã Quỳnh An"
      },
      {
        "id": "ward_12472",
        "label": "Xã Quỳnh Phụ"
      },
      {
        "id": "ward_11977",
        "label": "Xã Tân Hưng"
      },
      {
        "id": "ward_13246",
        "label": "Xã Tân Thuận"
      },
      {
        "id": "ward_12583",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_12919",
        "label": "Xã Tây Thái Ninh"
      },
      {
        "id": "ward_12850",
        "label": "Xã Tây Thụy Anh"
      },
      {
        "id": "ward_13039",
        "label": "Xã Tây Tiền Hải"
      },
      {
        "id": "ward_12922",
        "label": "Xã Thái Ninh"
      },
      {
        "id": "ward_12826",
        "label": "Xã Thái Thụy"
      },
      {
        "id": "ward_12631",
        "label": "Xã Thần Khê"
      },
      {
        "id": "ward_12865",
        "label": "Xã Thụy Anh"
      },
      {
        "id": "ward_13222",
        "label": "Xã Thư Trì"
      },
      {
        "id": "ward_13264",
        "label": "Xã Thư Vũ"
      },
      {
        "id": "ward_12970",
        "label": "Xã Tiền Hải"
      },
      {
        "id": "ward_12361",
        "label": "Xã Tiên Hoa"
      },
      {
        "id": "ward_12754",
        "label": "Xã Tiên Hưng"
      },
      {
        "id": "ward_12634",
        "label": "Xã Tiên La"
      },
      {
        "id": "ward_12364",
        "label": "Xã Tiên Lữ"
      },
      {
        "id": "ward_12424",
        "label": "Xã Tiên Tiến"
      },
      {
        "id": "ward_12427",
        "label": "Xã Tống Trân"
      },
      {
        "id": "ward_13093",
        "label": "Xã Trà Giang"
      },
      {
        "id": "ward_12223",
        "label": "Xã Triệu Việt Vương"
      },
      {
        "id": "ward_13219",
        "label": "Xã Vạn Xuân"
      },
      {
        "id": "ward_12019",
        "label": "Xã Văn Giang"
      },
      {
        "id": "ward_12238",
        "label": "Xã Việt Tiến"
      },
      {
        "id": "ward_12091",
        "label": "Xã Việt Yên"
      },
      {
        "id": "ward_13141",
        "label": "Xã Vũ Quý"
      },
      {
        "id": "ward_13192",
        "label": "Xã Vũ Thư"
      },
      {
        "id": "ward_13279",
        "label": "Xã Vũ Tiên"
      },
      {
        "id": "ward_12166",
        "label": "Xã Xuân Trúc"
      },
      {
        "id": "ward_12073",
        "label": "Xã Yên Mỹ"
      }
    ]
  },
  {
    "id": "khanh_hoa",
    "label": "Khánh Hòa",
    "wards": [
      {
        "id": "ward_22736",
        "label": "Đặc khu Trường Sa"
      },
      {
        "id": "ward_22423",
        "label": "Phường Ba Ngòi"
      },
      {
        "id": "ward_22741",
        "label": "Phường Bảo An"
      },
      {
        "id": "ward_22411",
        "label": "Phường Bắc Cam Ranh"
      },
      {
        "id": "ward_22333",
        "label": "Phường Bắc Nha Trang"
      },
      {
        "id": "ward_22432",
        "label": "Phường Cam Linh"
      },
      {
        "id": "ward_22420",
        "label": "Phường Cam Ranh"
      },
      {
        "id": "ward_22738",
        "label": "Phường Đô Vinh"
      },
      {
        "id": "ward_22780",
        "label": "Phường Đông Hải"
      },
      {
        "id": "ward_22561",
        "label": "Phường Đông Ninh Hòa"
      },
      {
        "id": "ward_22591",
        "label": "Phường Hòa Thắng"
      },
      {
        "id": "ward_22402",
        "label": "Phường Nam Nha Trang"
      },
      {
        "id": "ward_22366",
        "label": "Phường Nha Trang"
      },
      {
        "id": "ward_22834",
        "label": "Phường Ninh Chử"
      },
      {
        "id": "ward_22528",
        "label": "Phường Ninh Hòa"
      },
      {
        "id": "ward_22759",
        "label": "Phường Phan Rang"
      },
      {
        "id": "ward_22390",
        "label": "Phường Tây Nha Trang"
      },
      {
        "id": "ward_22828",
        "label": "Xã Anh Dũng"
      },
      {
        "id": "ward_22795",
        "label": "Xã Bác Ái"
      },
      {
        "id": "ward_22801",
        "label": "Xã Bác Ái Đông"
      },
      {
        "id": "ward_22786",
        "label": "Xã Bác Ái Tây"
      },
      {
        "id": "ward_22615",
        "label": "Xã Bắc Khánh Vĩnh"
      },
      {
        "id": "ward_22546",
        "label": "Xã Bắc Ninh Hòa"
      },
      {
        "id": "ward_22909",
        "label": "Xã Cà Ná"
      },
      {
        "id": "ward_22465",
        "label": "Xã Cam An"
      },
      {
        "id": "ward_22435",
        "label": "Xã Cam Hiệp"
      },
      {
        "id": "ward_22453",
        "label": "Xã Cam Lâm"
      },
      {
        "id": "ward_22840",
        "label": "Xã Công Hải"
      },
      {
        "id": "ward_22657",
        "label": "Xã Diên Điền"
      },
      {
        "id": "ward_22651",
        "label": "Xã Diên Khánh"
      },
      {
        "id": "ward_22678",
        "label": "Xã Diên Lạc"
      },
      {
        "id": "ward_22660",
        "label": "Xã Diên Lâm"
      },
      {
        "id": "ward_22672",
        "label": "Xã Diên Thọ"
      },
      {
        "id": "ward_22504",
        "label": "Xã Đại Lãnh"
      },
      {
        "id": "ward_22732",
        "label": "Xã Đông Khánh Sơn"
      },
      {
        "id": "ward_22558",
        "label": "Xã Hòa Trí"
      },
      {
        "id": "ward_22714",
        "label": "Xã Khánh Sơn"
      },
      {
        "id": "ward_22609",
        "label": "Xã Khánh Vĩnh"
      },
      {
        "id": "ward_22813",
        "label": "Xã Lâm Sơn"
      },
      {
        "id": "ward_22822",
        "label": "Xã Mỹ Sơn"
      },
      {
        "id": "ward_22480",
        "label": "Xã Nam Cam Ranh"
      },
      {
        "id": "ward_22648",
        "label": "Xã Nam Khánh Vĩnh"
      },
      {
        "id": "ward_22597",
        "label": "Xã Nam Ninh Hòa"
      },
      {
        "id": "ward_22852",
        "label": "Xã Ninh Hải"
      },
      {
        "id": "ward_22870",
        "label": "Xã Ninh Phước"
      },
      {
        "id": "ward_22810",
        "label": "Xã Ninh Sơn"
      },
      {
        "id": "ward_22888",
        "label": "Xã Phước Dinh"
      },
      {
        "id": "ward_22900",
        "label": "Xã Phước Hà"
      },
      {
        "id": "ward_22873",
        "label": "Xã Phước Hậu"
      },
      {
        "id": "ward_22891",
        "label": "Xã Phước Hữu"
      },
      {
        "id": "ward_22708",
        "label": "Xã Suối Dầu"
      },
      {
        "id": "ward_22702",
        "label": "Xã Suối Hiệp"
      },
      {
        "id": "ward_22576",
        "label": "Xã Tân Định"
      },
      {
        "id": "ward_22720",
        "label": "Xã Tây Khánh Sơn"
      },
      {
        "id": "ward_22624",
        "label": "Xã Tây Khánh Vĩnh"
      },
      {
        "id": "ward_22552",
        "label": "Xã Tây Ninh Hòa"
      },
      {
        "id": "ward_22849",
        "label": "Xã Thuận Bắc"
      },
      {
        "id": "ward_22897",
        "label": "Xã Thuận Nam"
      },
      {
        "id": "ward_22612",
        "label": "Xã Trung Khánh Vĩnh"
      },
      {
        "id": "ward_22498",
        "label": "Xã Tu Bông"
      },
      {
        "id": "ward_22525",
        "label": "Xã Vạn Hưng"
      },
      {
        "id": "ward_22489",
        "label": "Xã Vạn Ninh"
      },
      {
        "id": "ward_22516",
        "label": "Xã Vạn Thắng"
      },
      {
        "id": "ward_22846",
        "label": "Xã Vĩnh Hải"
      },
      {
        "id": "ward_22861",
        "label": "Xã Xuân Hải"
      }
    ]
  },
  {
    "id": "lai_chau",
    "label": "Lai Châu",
    "wards": [
      {
        "id": "ward_03388",
        "label": "Phường Đoàn Kết"
      },
      {
        "id": "ward_03408",
        "label": "Phường Tân Phong"
      },
      {
        "id": "ward_03424",
        "label": "Xã Bản Bo"
      },
      {
        "id": "ward_03390",
        "label": "Xã Bình Lư"
      },
      {
        "id": "ward_03466",
        "label": "Xã Bum Nưa"
      },
      {
        "id": "ward_03433",
        "label": "Xã Bum Tở"
      },
      {
        "id": "ward_03571",
        "label": "Xã Dào San"
      },
      {
        "id": "ward_03508",
        "label": "Xã Hồng Thu"
      },
      {
        "id": "ward_03460",
        "label": "Xã Hua Bum"
      },
      {
        "id": "ward_03640",
        "label": "Xã Khoen On"
      },
      {
        "id": "ward_03583",
        "label": "Xã Khổng Lào"
      },
      {
        "id": "ward_03430",
        "label": "Xã Khun Há"
      },
      {
        "id": "ward_03487",
        "label": "Xã Lê Lợi"
      },
      {
        "id": "ward_03451",
        "label": "Xã Mù Cả"
      },
      {
        "id": "ward_03601",
        "label": "Xã Mường Khoa"
      },
      {
        "id": "ward_03637",
        "label": "Xã Mường Kim"
      },
      {
        "id": "ward_03472",
        "label": "Xã Mường Mô"
      },
      {
        "id": "ward_03445",
        "label": "Xã Mường Tè"
      },
      {
        "id": "ward_03618",
        "label": "Xã Mường Than"
      },
      {
        "id": "ward_03544",
        "label": "Xã Nậm Cuổi"
      },
      {
        "id": "ward_03434",
        "label": "Xã Nậm Hàng"
      },
      {
        "id": "ward_03538",
        "label": "Xã Nậm Mạ"
      },
      {
        "id": "ward_03613",
        "label": "Xã Nậm Sỏ"
      },
      {
        "id": "ward_03517",
        "label": "Xã Nậm Tăm"
      },
      {
        "id": "ward_03503",
        "label": "Xã Pa Tần"
      },
      {
        "id": "ward_03442",
        "label": "Xã Pa Ủ"
      },
      {
        "id": "ward_03616",
        "label": "Xã Pắc Ta"
      },
      {
        "id": "ward_03549",
        "label": "Xã Phong Thổ"
      },
      {
        "id": "ward_03532",
        "label": "Xã Pu Sam Cáp"
      },
      {
        "id": "ward_03562",
        "label": "Xã Sì Lở Lầu"
      },
      {
        "id": "ward_03478",
        "label": "Xã Sìn Hồ"
      },
      {
        "id": "ward_03394",
        "label": "Xã Sin Suối Hồ"
      },
      {
        "id": "ward_03405",
        "label": "Xã Tả Lèng"
      },
      {
        "id": "ward_03463",
        "label": "Xã Tà Tổng"
      },
      {
        "id": "ward_03598",
        "label": "Xã Tân Uyên"
      },
      {
        "id": "ward_03595",
        "label": "Xã Than Uyên"
      },
      {
        "id": "ward_03439",
        "label": "Xã Thu Lũm"
      },
      {
        "id": "ward_03529",
        "label": "Xã Tủa Sín Chải"
      }
    ]
  },
  {
    "id": "lang_son",
    "label": "Lạng Sơn",
    "wards": [
      {
        "id": "ward_05977",
        "label": "Phường Đông Kinh"
      },
      {
        "id": "ward_06187",
        "label": "Phường Kỳ Lừa"
      },
      {
        "id": "ward_05983",
        "label": "Phường Lương Văn Tri"
      },
      {
        "id": "ward_05986",
        "label": "Phường Tam Thanh"
      },
      {
        "id": "ward_06196",
        "label": "Xã Ba Sơn"
      },
      {
        "id": "ward_06325",
        "label": "Xã Bắc Sơn"
      },
      {
        "id": "ward_06475",
        "label": "Xã Bằng Mạc"
      },
      {
        "id": "ward_06112",
        "label": "Xã Bình Gia"
      },
      {
        "id": "ward_06427",
        "label": "Xã Cai Kinh"
      },
      {
        "id": "ward_06211",
        "label": "Xã Cao Lộc"
      },
      {
        "id": "ward_06637",
        "label": "Xã Châu Sơn"
      },
      {
        "id": "ward_06463",
        "label": "Xã Chi Lăng"
      },
      {
        "id": "ward_06481",
        "label": "Xã Chiến Thắng"
      },
      {
        "id": "ward_06220",
        "label": "Xã Công Sơn"
      },
      {
        "id": "ward_06280",
        "label": "Xã Điềm He"
      },
      {
        "id": "ward_06613",
        "label": "Xã Đình Lập"
      },
      {
        "id": "ward_06001",
        "label": "Xã Đoàn Kết"
      },
      {
        "id": "ward_06184",
        "label": "Xã Đồng Đăng"
      },
      {
        "id": "ward_06073",
        "label": "Xã Hoa Thám"
      },
      {
        "id": "ward_06172",
        "label": "Xã Hoàng Văn Thụ"
      },
      {
        "id": "ward_06151",
        "label": "Xã Hội Hoan"
      },
      {
        "id": "ward_06079",
        "label": "Xã Hồng Phong"
      },
      {
        "id": "ward_06349",
        "label": "Xã Hưng Vũ"
      },
      {
        "id": "ward_06400",
        "label": "Xã Hữu Liên"
      },
      {
        "id": "ward_06385",
        "label": "Xã Hữu Lũng"
      },
      {
        "id": "ward_06037",
        "label": "Xã Kháng Chiến"
      },
      {
        "id": "ward_06286",
        "label": "Xã Khánh Khê"
      },
      {
        "id": "ward_06565",
        "label": "Xã Khuất Xá"
      },
      {
        "id": "ward_06625",
        "label": "Xã Kiên Mộc"
      },
      {
        "id": "ward_06529",
        "label": "Xã Lộc Bình"
      },
      {
        "id": "ward_06601",
        "label": "Xã Lợi Bác"
      },
      {
        "id": "ward_06541",
        "label": "Xã Mẫu Sơn"
      },
      {
        "id": "ward_06526",
        "label": "Xã Na Dương"
      },
      {
        "id": "ward_06124",
        "label": "Xã Na Sầm"
      },
      {
        "id": "ward_06496",
        "label": "Xã Nhân Lý"
      },
      {
        "id": "ward_06376",
        "label": "Xã Nhất Hòa"
      },
      {
        "id": "ward_06517",
        "label": "Xã Quan Sơn"
      },
      {
        "id": "ward_06004",
        "label": "Xã Quốc Khánh"
      },
      {
        "id": "ward_06058",
        "label": "Xã Quốc Việt"
      },
      {
        "id": "ward_06076",
        "label": "Xã Quý Hòa"
      },
      {
        "id": "ward_06316",
        "label": "Xã Tân Đoàn"
      },
      {
        "id": "ward_06445",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_06019",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_06337",
        "label": "Xã Tân Tri"
      },
      {
        "id": "ward_06115",
        "label": "Xã Tân Văn"
      },
      {
        "id": "ward_06616",
        "label": "Xã Thái Bình"
      },
      {
        "id": "ward_06040",
        "label": "Xã Thất Khê"
      },
      {
        "id": "ward_06085",
        "label": "Xã Thiện Hòa"
      },
      {
        "id": "ward_06103",
        "label": "Xã Thiện Long"
      },
      {
        "id": "ward_06436",
        "label": "Xã Thiện Tân"
      },
      {
        "id": "ward_06091",
        "label": "Xã Thiện Thuật"
      },
      {
        "id": "ward_06577",
        "label": "Xã Thống Nhất"
      },
      {
        "id": "ward_06148",
        "label": "Xã Thụy Hùng"
      },
      {
        "id": "ward_06046",
        "label": "Xã Tràng Định"
      },
      {
        "id": "ward_06313",
        "label": "Xã Tri Lễ"
      },
      {
        "id": "ward_06457",
        "label": "Xã Tuấn Sơn"
      },
      {
        "id": "ward_06505",
        "label": "Xã Vạn Linh"
      },
      {
        "id": "ward_06154",
        "label": "Xã Văn Lãng"
      },
      {
        "id": "ward_06253",
        "label": "Xã Văn Quan"
      },
      {
        "id": "ward_06415",
        "label": "Xã Vân Nham"
      },
      {
        "id": "ward_06367",
        "label": "Xã Vũ Lăng"
      },
      {
        "id": "ward_06364",
        "label": "Xã Vũ Lễ"
      },
      {
        "id": "ward_06607",
        "label": "Xã Xuân Dương"
      },
      {
        "id": "ward_06391",
        "label": "Xã Yên Bình"
      },
      {
        "id": "ward_06298",
        "label": "Xã Yên Phúc"
      }
    ]
  },
  {
    "id": "lao_cai",
    "label": "Lào Cai",
    "wards": [
      {
        "id": "ward_04543",
        "label": "Phường Âu Lâu"
      },
      {
        "id": "ward_02671",
        "label": "Phường Cam Đường"
      },
      {
        "id": "ward_04681",
        "label": "Phường Cầu Thia"
      },
      {
        "id": "ward_02647",
        "label": "Phường Lào Cai"
      },
      {
        "id": "ward_04273",
        "label": "Phường Nam Cường"
      },
      {
        "id": "ward_04288",
        "label": "Phường Nghĩa Lộ"
      },
      {
        "id": "ward_03006",
        "label": "Phường Sa Pa"
      },
      {
        "id": "ward_04663",
        "label": "Phường Trung Tâm"
      },
      {
        "id": "ward_04279",
        "label": "Phường Văn Phú"
      },
      {
        "id": "ward_04252",
        "label": "Phường Yên Bái"
      },
      {
        "id": "ward_02686",
        "label": "Xã A Mú Sung"
      },
      {
        "id": "ward_03046",
        "label": "Xã Bản Hồ"
      },
      {
        "id": "ward_02788",
        "label": "Xã Bản Lầu"
      },
      {
        "id": "ward_02869",
        "label": "Xã Bản Liền"
      },
      {
        "id": "ward_02725",
        "label": "Xã Bản Xèo"
      },
      {
        "id": "ward_04750",
        "label": "Xã Bảo Ái"
      },
      {
        "id": "ward_02989",
        "label": "Xã Bảo Hà"
      },
      {
        "id": "ward_02890",
        "label": "Xã Bảo Nhai"
      },
      {
        "id": "ward_02905",
        "label": "Xã Bảo Thắng"
      },
      {
        "id": "ward_02947",
        "label": "Xã Bảo Yên"
      },
      {
        "id": "ward_02683",
        "label": "Xã Bát Xát"
      },
      {
        "id": "ward_02839",
        "label": "Xã Bắc Hà"
      },
      {
        "id": "ward_04726",
        "label": "Xã Cảm Nhân"
      },
      {
        "id": "ward_02782",
        "label": "Xã Cao Sơn"
      },
      {
        "id": "ward_04693",
        "label": "Xã Cát Thịnh"
      },
      {
        "id": "ward_04699",
        "label": "Xã Chấn Thịnh"
      },
      {
        "id": "ward_04387",
        "label": "Xã Châu Quế"
      },
      {
        "id": "ward_04489",
        "label": "Xã Chế Tạo"
      },
      {
        "id": "ward_03091",
        "label": "Xã Chiềng Ken"
      },
      {
        "id": "ward_02896",
        "label": "Xã Cốc Lầu"
      },
      {
        "id": "ward_02746",
        "label": "Xã Cốc San"
      },
      {
        "id": "ward_02707",
        "label": "Xã Dền Sáng"
      },
      {
        "id": "ward_03106",
        "label": "Xã Dương Quỳ"
      },
      {
        "id": "ward_04399",
        "label": "Xã Đông Cuông"
      },
      {
        "id": "ward_04636",
        "label": "Xã Gia Hội"
      },
      {
        "id": "ward_02923",
        "label": "Xã Gia Phú"
      },
      {
        "id": "ward_04585",
        "label": "Xã Hạnh Phúc"
      },
      {
        "id": "ward_02680",
        "label": "Xã Hợp Thành"
      },
      {
        "id": "ward_04576",
        "label": "Xã Hưng Khánh"
      },
      {
        "id": "ward_04342",
        "label": "Xã Khánh Hòa"
      },
      {
        "id": "ward_03103",
        "label": "Xã Khánh Yên"
      },
      {
        "id": "ward_04465",
        "label": "Xã Khao Mang"
      },
      {
        "id": "ward_04474",
        "label": "Xã Lao Chải"
      },
      {
        "id": "ward_04381",
        "label": "Xã Lâm Giang"
      },
      {
        "id": "ward_04309",
        "label": "Xã Lâm Thượng"
      },
      {
        "id": "ward_04660",
        "label": "Xã Liên Sơn"
      },
      {
        "id": "ward_04303",
        "label": "Xã Lục Yên"
      },
      {
        "id": "ward_02848",
        "label": "Xã Lùng Phình"
      },
      {
        "id": "ward_04537",
        "label": "Xã Lương Thịnh"
      },
      {
        "id": "ward_04375",
        "label": "Xã Mậu A"
      },
      {
        "id": "ward_03121",
        "label": "Xã Minh Lương"
      },
      {
        "id": "ward_04450",
        "label": "Xã Mỏ Vàng"
      },
      {
        "id": "ward_04456",
        "label": "Xã Mù Cang Chải"
      },
      {
        "id": "ward_03043",
        "label": "Xã Mường Bo"
      },
      {
        "id": "ward_02728",
        "label": "Xã Mường Hum"
      },
      {
        "id": "ward_02761",
        "label": "Xã Mường Khương"
      },
      {
        "id": "ward_04345",
        "label": "Xã Mường Lai"
      },
      {
        "id": "ward_03076",
        "label": "Xã Nậm Chày"
      },
      {
        "id": "ward_04462",
        "label": "Xã Nậm Có"
      },
      {
        "id": "ward_03085",
        "label": "Xã Nậm Xé"
      },
      {
        "id": "ward_02953",
        "label": "Xã Nghĩa Đô"
      },
      {
        "id": "ward_04711",
        "label": "Xã Nghĩa Tâm"
      },
      {
        "id": "ward_03004",
        "label": "Xã Ngũ Chỉ Sơn"
      },
      {
        "id": "ward_02752",
        "label": "Xã Pha Long"
      },
      {
        "id": "ward_04609",
        "label": "Xã Phình Hồ"
      },
      {
        "id": "ward_04402",
        "label": "Xã Phong Dụ Hạ"
      },
      {
        "id": "ward_04423",
        "label": "Xã Phong Dụ Thượng"
      },
      {
        "id": "ward_02902",
        "label": "Xã Phong Hải"
      },
      {
        "id": "ward_02998",
        "label": "Xã Phúc Khánh"
      },
      {
        "id": "ward_04363",
        "label": "Xã Phúc Lợi"
      },
      {
        "id": "ward_04492",
        "label": "Xã Púng Luông"
      },
      {
        "id": "ward_04531",
        "label": "Xã Quy Mông"
      },
      {
        "id": "ward_02809",
        "label": "Xã Si Ma Cai"
      },
      {
        "id": "ward_02824",
        "label": "Xã Sín Chéng"
      },
      {
        "id": "ward_04651",
        "label": "Xã Sơn Lương"
      },
      {
        "id": "ward_02842",
        "label": "Xã Tả Củ Tỷ"
      },
      {
        "id": "ward_03013",
        "label": "Xã Tả Phìn"
      },
      {
        "id": "ward_03037",
        "label": "Xã Tả Van"
      },
      {
        "id": "ward_04603",
        "label": "Xã Tà Xi Láng"
      },
      {
        "id": "ward_02908",
        "label": "Xã Tằng Loỏng"
      },
      {
        "id": "ward_04429",
        "label": "Xã Tân Hợp"
      },
      {
        "id": "ward_04336",
        "label": "Xã Tân Lĩnh"
      },
      {
        "id": "ward_04717",
        "label": "Xã Thác Bà"
      },
      {
        "id": "ward_04705",
        "label": "Xã Thượng Bằng La"
      },
      {
        "id": "ward_02968",
        "label": "Xã Thượng Hà"
      },
      {
        "id": "ward_04606",
        "label": "Xã Trạm Tấu"
      },
      {
        "id": "ward_04498",
        "label": "Xã Trấn Yên"
      },
      {
        "id": "ward_02695",
        "label": "Xã Trịnh Tường"
      },
      {
        "id": "ward_04630",
        "label": "Xã Tú Lệ"
      },
      {
        "id": "ward_03082",
        "label": "Xã Văn Bàn"
      },
      {
        "id": "ward_04672",
        "label": "Xã Văn Chấn"
      },
      {
        "id": "ward_04564",
        "label": "Xã Việt Hồng"
      },
      {
        "id": "ward_03061",
        "label": "Xã Võ Lao"
      },
      {
        "id": "ward_04441",
        "label": "Xã Xuân Ái"
      },
      {
        "id": "ward_02962",
        "label": "Xã Xuân Hòa"
      },
      {
        "id": "ward_02926",
        "label": "Xã Xuân Quang"
      },
      {
        "id": "ward_02701",
        "label": "Xã Y Tý"
      },
      {
        "id": "ward_04714",
        "label": "Xã Yên Bình"
      },
      {
        "id": "ward_04744",
        "label": "Xã Yên Thành"
      }
    ]
  },
  {
    "id": "lam_dong",
    "label": "Lâm Đồng",
    "wards": [
      {
        "id": "ward_23272",
        "label": "Đặc khu Phú Quý"
      },
      {
        "id": "ward_24823",
        "label": "Phường 1 Bảo Lộc"
      },
      {
        "id": "ward_24820",
        "label": "Phường 2 Bảo Lộc"
      },
      {
        "id": "ward_24841",
        "label": "Phường 3 Bảo Lộc"
      },
      {
        "id": "ward_24829",
        "label": "Phường B'Lao"
      },
      {
        "id": "ward_24611",
        "label": "Phường Bắc Gia Nghĩa"
      },
      {
        "id": "ward_22960",
        "label": "Phường Bình Thuận"
      },
      {
        "id": "ward_24787",
        "label": "Phường Cam Ly - Đà Lạt"
      },
      {
        "id": "ward_24617",
        "label": "Phường Đông Gia Nghĩa"
      },
      {
        "id": "ward_22933",
        "label": "Phường Hàm Thắng"
      },
      {
        "id": "ward_23235",
        "label": "Phường La Gi"
      },
      {
        "id": "ward_24846",
        "label": "Phường Lang Biang - Đà Lạt"
      },
      {
        "id": "ward_24778",
        "label": "Phường Lâm Viên - Đà Lạt"
      },
      {
        "id": "ward_22918",
        "label": "Phường Mũi Né"
      },
      {
        "id": "ward_24615",
        "label": "Phường Nam Gia Nghĩa"
      },
      {
        "id": "ward_22945",
        "label": "Phường Phan Thiết"
      },
      {
        "id": "ward_22924",
        "label": "Phường Phú Thủy"
      },
      {
        "id": "ward_23231",
        "label": "Phường Phước Hội"
      },
      {
        "id": "ward_22954",
        "label": "Phường Tiến Thành"
      },
      {
        "id": "ward_24781",
        "label": "Phường Xuân Hương - Đà Lạt"
      },
      {
        "id": "ward_24805",
        "label": "Phường Xuân Trường - Đà Lạt"
      },
      {
        "id": "ward_25054",
        "label": "Xã Bảo Lâm 1"
      },
      {
        "id": "ward_25084",
        "label": "Xã Bảo Lâm 2"
      },
      {
        "id": "ward_25093",
        "label": "Xã Bảo Lâm 3"
      },
      {
        "id": "ward_25063",
        "label": "Xã Bảo Lâm 4"
      },
      {
        "id": "ward_25057",
        "label": "Xã Bảo Lâm 5"
      },
      {
        "id": "ward_25018",
        "label": "Xã Bảo Thuận"
      },
      {
        "id": "ward_23005",
        "label": "Xã Bắc Bình"
      },
      {
        "id": "ward_23152",
        "label": "Xã Bắc Ruộng"
      },
      {
        "id": "ward_25159",
        "label": "Xã Cát Tiên"
      },
      {
        "id": "ward_25180",
        "label": "Xã Cát Tiên 2"
      },
      {
        "id": "ward_25162",
        "label": "Xã Cát Tiên 3"
      },
      {
        "id": "ward_24640",
        "label": "Xã Cư Jút"
      },
      {
        "id": "ward_24934",
        "label": "Xã D'Ran"
      },
      {
        "id": "ward_25000",
        "label": "Xã Di Linh"
      },
      {
        "id": "ward_25099",
        "label": "Xã Đạ Huoai"
      },
      {
        "id": "ward_25105",
        "label": "Xã Đạ Huoai 2"
      },
      {
        "id": "ward_25114",
        "label": "Xã Đạ Huoai 3"
      },
      {
        "id": "ward_25126",
        "label": "Xã Đạ Tẻh"
      },
      {
        "id": "ward_25138",
        "label": "Xã Đạ Tẻh 2"
      },
      {
        "id": "ward_25135",
        "label": "Xã Đạ Tẻh 3"
      },
      {
        "id": "ward_24886",
        "label": "Xã Đam Rông 1"
      },
      {
        "id": "ward_24877",
        "label": "Xã Đam Rông 2"
      },
      {
        "id": "ward_24875",
        "label": "Xã Đam Rông 3"
      },
      {
        "id": "ward_24853",
        "label": "Xã Đam Rông 4"
      },
      {
        "id": "ward_24670",
        "label": "Xã Đắk Mil"
      },
      {
        "id": "ward_24678",
        "label": "Xã Đắk Sắk"
      },
      {
        "id": "ward_24718",
        "label": "Xã Đắk Song"
      },
      {
        "id": "ward_24646",
        "label": "Xã Đắk Wil"
      },
      {
        "id": "ward_25007",
        "label": "Xã Đinh Trang Thượng"
      },
      {
        "id": "ward_24871",
        "label": "Xã Đinh Văn Lâm Hà"
      },
      {
        "id": "ward_23074",
        "label": "Xã Đông Giang"
      },
      {
        "id": "ward_23173",
        "label": "Xã Đồng Kho"
      },
      {
        "id": "ward_24931",
        "label": "Xã Đơn Dương"
      },
      {
        "id": "ward_24717",
        "label": "Xã Đức An"
      },
      {
        "id": "ward_24664",
        "label": "Xã Đức Lập"
      },
      {
        "id": "ward_23191",
        "label": "Xã Đức Linh"
      },
      {
        "id": "ward_24958",
        "label": "Xã Đức Trọng"
      },
      {
        "id": "ward_25015",
        "label": "Xã Gia Hiệp"
      },
      {
        "id": "ward_23020",
        "label": "Xã Hải Ninh"
      },
      {
        "id": "ward_23128",
        "label": "Xã Hàm Kiệm"
      },
      {
        "id": "ward_23095",
        "label": "Xã Hàm Liêm"
      },
      {
        "id": "ward_23236",
        "label": "Xã Hàm Tân"
      },
      {
        "id": "ward_23122",
        "label": "Xã Hàm Thạnh"
      },
      {
        "id": "ward_23059",
        "label": "Xã Hàm Thuận"
      },
      {
        "id": "ward_23089",
        "label": "Xã Hàm Thuận Bắc"
      },
      {
        "id": "ward_23110",
        "label": "Xã Hàm Thuận Nam"
      },
      {
        "id": "ward_24967",
        "label": "Xã Hiệp Thạnh"
      },
      {
        "id": "ward_25042",
        "label": "Xã Hòa Bắc"
      },
      {
        "id": "ward_25036",
        "label": "Xã Hòa Ninh"
      },
      {
        "id": "ward_23053",
        "label": "Xã Hòa Thắng"
      },
      {
        "id": "ward_23194",
        "label": "Xã Hoài Đức"
      },
      {
        "id": "ward_23086",
        "label": "Xã Hồng Sơn"
      },
      {
        "id": "ward_23041",
        "label": "Xã Hồng Thái"
      },
      {
        "id": "ward_24943",
        "label": "Xã Ka Đô"
      },
      {
        "id": "ward_24733",
        "label": "Xã Kiến Đức"
      },
      {
        "id": "ward_24688",
        "label": "Xã Krông Nô"
      },
      {
        "id": "ward_23065",
        "label": "Xã La Dạ"
      },
      {
        "id": "ward_24848",
        "label": "Xã Lạc Dương"
      },
      {
        "id": "ward_22969",
        "label": "Xã Liên Hương"
      },
      {
        "id": "ward_23032",
        "label": "Xã Lương Sơn"
      },
      {
        "id": "ward_24868",
        "label": "Xã Nam Ban Lâm Hà"
      },
      {
        "id": "ward_24649",
        "label": "Xã Nam Dong"
      },
      {
        "id": "ward_24697",
        "label": "Xã Nam Đà"
      },
      {
        "id": "ward_24883",
        "label": "Xã Nam Hà Lâm Hà"
      },
      {
        "id": "ward_23200",
        "label": "Xã Nam Thành"
      },
      {
        "id": "ward_24703",
        "label": "Xã Nâm Nung"
      },
      {
        "id": "ward_23158",
        "label": "Xã Nghị Đức"
      },
      {
        "id": "ward_24751",
        "label": "Xã Nhân Cơ"
      },
      {
        "id": "ward_24985",
        "label": "Xã Ninh Gia"
      },
      {
        "id": "ward_22972",
        "label": "Xã Phan Rí Cửa"
      },
      {
        "id": "ward_23008",
        "label": "Xã Phan Sơn"
      },
      {
        "id": "ward_24895",
        "label": "Xã Phú Sơn Lâm Hà"
      },
      {
        "id": "ward_24907",
        "label": "Xã Phúc Thọ Lâm Hà"
      },
      {
        "id": "ward_24620",
        "label": "Xã Quảng Hòa"
      },
      {
        "id": "ward_24631",
        "label": "Xã Quảng Khê"
      },
      {
        "id": "ward_24955",
        "label": "Xã Quảng Lập"
      },
      {
        "id": "ward_24712",
        "label": "Xã Quảng Phú"
      },
      {
        "id": "ward_24616",
        "label": "Xã Quảng Sơn"
      },
      {
        "id": "ward_24748",
        "label": "Xã Quảng Tân"
      },
      {
        "id": "ward_24760",
        "label": "Xã Quảng Tín"
      },
      {
        "id": "ward_24736",
        "label": "Xã Quảng Trực"
      },
      {
        "id": "ward_23023",
        "label": "Xã Sông Lũy"
      },
      {
        "id": "ward_25051",
        "label": "Xã Sơn Điền"
      },
      {
        "id": "ward_23266",
        "label": "Xã Sơn Mỹ"
      },
      {
        "id": "ward_23188",
        "label": "Xã Suối Kiết"
      },
      {
        "id": "ward_24637",
        "label": "Xã Tà Đùng"
      },
      {
        "id": "ward_24991",
        "label": "Xã Tà Hine"
      },
      {
        "id": "ward_24988",
        "label": "Xã Tà Năng"
      },
      {
        "id": "ward_23149",
        "label": "Xã Tánh Linh"
      },
      {
        "id": "ward_24916",
        "label": "Xã Tân Hà Lâm Hà"
      },
      {
        "id": "ward_23246",
        "label": "Xã Tân Hải"
      },
      {
        "id": "ward_24976",
        "label": "Xã Tân Hội"
      },
      {
        "id": "ward_23134",
        "label": "Xã Tân Lập"
      },
      {
        "id": "ward_23230",
        "label": "Xã Tân Minh"
      },
      {
        "id": "ward_23143",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_24682",
        "label": "Xã Thuận An"
      },
      {
        "id": "ward_24722",
        "label": "Xã Thuận Hạnh"
      },
      {
        "id": "ward_23227",
        "label": "Xã Trà Tân"
      },
      {
        "id": "ward_24730",
        "label": "Xã Trường Xuân"
      },
      {
        "id": "ward_24739",
        "label": "Xã Tuy Đức"
      },
      {
        "id": "ward_22978",
        "label": "Xã Tuy Phong"
      },
      {
        "id": "ward_22963",
        "label": "Xã Tuyên Quang"
      },
      {
        "id": "ward_22981",
        "label": "Xã Vĩnh Hảo"
      }
    ]
  },
  {
    "id": "nghe_an",
    "label": "Nghệ An",
    "wards": [
      {
        "id": "ward_16732",
        "label": "Phường Cửa Lò"
      },
      {
        "id": "ward_17110",
        "label": "Phường Hoàng Mai"
      },
      {
        "id": "ward_17125",
        "label": "Phường Quỳnh Mai"
      },
      {
        "id": "ward_17128",
        "label": "Phường Tân Mai"
      },
      {
        "id": "ward_17011",
        "label": "Phường Tây Hiếu"
      },
      {
        "id": "ward_16939",
        "label": "Phường Thái Hòa"
      },
      {
        "id": "ward_16681",
        "label": "Phường Thành Vinh"
      },
      {
        "id": "ward_16690",
        "label": "Phường Trường Vinh"
      },
      {
        "id": "ward_17920",
        "label": "Phường Vinh Hưng"
      },
      {
        "id": "ward_16708",
        "label": "Phường Vinh Lộc"
      },
      {
        "id": "ward_16702",
        "label": "Phường Vinh Phú"
      },
      {
        "id": "ward_17479",
        "label": "Xã An Châu"
      },
      {
        "id": "ward_17329",
        "label": "Xã Anh Sơn"
      },
      {
        "id": "ward_17365",
        "label": "Xã Anh Sơn Đông"
      },
      {
        "id": "ward_17707",
        "label": "Xã Bạch Hà"
      },
      {
        "id": "ward_17623",
        "label": "Xã Bạch Ngọc"
      },
      {
        "id": "ward_16819",
        "label": "Xã Bắc Lý"
      },
      {
        "id": "ward_17818",
        "label": "Xã Bích Hào"
      },
      {
        "id": "ward_17230",
        "label": "Xã Bình Chuẩn"
      },
      {
        "id": "ward_17515",
        "label": "Xã Bình Minh"
      },
      {
        "id": "ward_17242",
        "label": "Xã Cam Phục"
      },
      {
        "id": "ward_17728",
        "label": "Xã Cát Ngạn"
      },
      {
        "id": "ward_16804",
        "label": "Xã Châu Bình"
      },
      {
        "id": "ward_17044",
        "label": "Xã Châu Hồng"
      },
      {
        "id": "ward_17248",
        "label": "Xã Châu Khê"
      },
      {
        "id": "ward_17056",
        "label": "Xã Châu Lộc"
      },
      {
        "id": "ward_16792",
        "label": "Xã Châu Tiến"
      },
      {
        "id": "ward_16855",
        "label": "Xã Chiêu Lưu"
      },
      {
        "id": "ward_17254",
        "label": "Xã Con Cuông"
      },
      {
        "id": "ward_17464",
        "label": "Xã Diễn Châu"
      },
      {
        "id": "ward_17713",
        "label": "Xã Đại Đồng"
      },
      {
        "id": "ward_17944",
        "label": "Xã Đại Huệ"
      },
      {
        "id": "ward_17662",
        "label": "Xã Đô Lương"
      },
      {
        "id": "ward_17017",
        "label": "Xã Đông Hiếu"
      },
      {
        "id": "ward_17878",
        "label": "Xã Đông Lộc"
      },
      {
        "id": "ward_17530",
        "label": "Xã Đông Thành"
      },
      {
        "id": "ward_17416",
        "label": "Xã Đức Châu"
      },
      {
        "id": "ward_17524",
        "label": "Xã Giai Lạc"
      },
      {
        "id": "ward_17278",
        "label": "Xã Giai Xuân"
      },
      {
        "id": "ward_17419",
        "label": "Xã Hải Châu"
      },
      {
        "id": "ward_17833",
        "label": "Xã Hải Lộc"
      },
      {
        "id": "ward_17722",
        "label": "Xã Hạnh Lâm"
      },
      {
        "id": "ward_17770",
        "label": "Xã Hoa Quân"
      },
      {
        "id": "ward_17605",
        "label": "Xã Hợp Minh"
      },
      {
        "id": "ward_16801",
        "label": "Xã Hùng Chân"
      },
      {
        "id": "ward_17395",
        "label": "Xã Hùng Châu"
      },
      {
        "id": "ward_16828",
        "label": "Xã Huồi Tụ"
      },
      {
        "id": "ward_18001",
        "label": "Xã Hưng Nguyên"
      },
      {
        "id": "ward_18028",
        "label": "Xã Hưng Nguyên Nam"
      },
      {
        "id": "ward_16885",
        "label": "Xã Hữu Khuông"
      },
      {
        "id": "ward_16849",
        "label": "Xã Hữu Kiệm"
      },
      {
        "id": "ward_16822",
        "label": "Xã Keng Đu"
      },
      {
        "id": "ward_17791",
        "label": "Xã Kim Bảng"
      },
      {
        "id": "ward_17971",
        "label": "Xã Kim Liên"
      },
      {
        "id": "ward_18040",
        "label": "Xã Lam Thành"
      },
      {
        "id": "ward_16906",
        "label": "Xã Lượng Minh"
      },
      {
        "id": "ward_17641",
        "label": "Xã Lương Sơn"
      },
      {
        "id": "ward_17239",
        "label": "Xã Mậu Thạch"
      },
      {
        "id": "ward_17476",
        "label": "Xã Minh Châu"
      },
      {
        "id": "ward_17071",
        "label": "Xã Minh Hợp"
      },
      {
        "id": "ward_17263",
        "label": "Xã Môn Sơn"
      },
      {
        "id": "ward_17089",
        "label": "Xã Mường Chọng"
      },
      {
        "id": "ward_17077",
        "label": "Xã Mường Ham"
      },
      {
        "id": "ward_16831",
        "label": "Xã Mường Lống"
      },
      {
        "id": "ward_16774",
        "label": "Xã Mường Quàng"
      },
      {
        "id": "ward_16858",
        "label": "Xã Mường Típ"
      },
      {
        "id": "ward_16813",
        "label": "Xã Mường Xén"
      },
      {
        "id": "ward_16816",
        "label": "Xã Mỹ Lý"
      },
      {
        "id": "ward_16834",
        "label": "Xã Na Loi"
      },
      {
        "id": "ward_16870",
        "label": "Xã Na Ngoi"
      },
      {
        "id": "ward_17935",
        "label": "Xã Nam Đàn"
      },
      {
        "id": "ward_16837",
        "label": "Xã Nậm Cắn"
      },
      {
        "id": "ward_16903",
        "label": "Xã Nga My"
      },
      {
        "id": "ward_17827",
        "label": "Xã Nghi Lộc"
      },
      {
        "id": "ward_16941",
        "label": "Xã Nghĩa Đàn"
      },
      {
        "id": "ward_17284",
        "label": "Xã Nghĩa Đồng"
      },
      {
        "id": "ward_17326",
        "label": "Xã Nghĩa Hành"
      },
      {
        "id": "ward_16972",
        "label": "Xã Nghĩa Hưng"
      },
      {
        "id": "ward_17032",
        "label": "Xã Nghĩa Khánh"
      },
      {
        "id": "ward_16951",
        "label": "Xã Nghĩa Lâm"
      },
      {
        "id": "ward_17029",
        "label": "Xã Nghĩa Lộc"
      },
      {
        "id": "ward_16975",
        "label": "Xã Nghĩa Mai"
      },
      {
        "id": "ward_16969",
        "label": "Xã Nghĩa Thọ"
      },
      {
        "id": "ward_17344",
        "label": "Xã Nhân Hòa"
      },
      {
        "id": "ward_16882",
        "label": "Xã Nhôn Mai"
      },
      {
        "id": "ward_17857",
        "label": "Xã Phúc Lộc"
      },
      {
        "id": "ward_17569",
        "label": "Xã Quan Thành"
      },
      {
        "id": "ward_17443",
        "label": "Xã Quảng Châu"
      },
      {
        "id": "ward_17521",
        "label": "Xã Quang Đồng"
      },
      {
        "id": "ward_16738",
        "label": "Xã Quế Phong"
      },
      {
        "id": "ward_16777",
        "label": "Xã Quỳ Châu"
      },
      {
        "id": "ward_17035",
        "label": "Xã Quỳ Hợp"
      },
      {
        "id": "ward_17176",
        "label": "Xã Quỳnh Anh"
      },
      {
        "id": "ward_17179",
        "label": "Xã Quỳnh Lưu"
      },
      {
        "id": "ward_17212",
        "label": "Xã Quỳnh Phú"
      },
      {
        "id": "ward_17170",
        "label": "Xã Quỳnh Sơn"
      },
      {
        "id": "ward_17149",
        "label": "Xã Quỳnh Tam"
      },
      {
        "id": "ward_17224",
        "label": "Xã Quỳnh Thắng"
      },
      {
        "id": "ward_17143",
        "label": "Xã Quỳnh Văn"
      },
      {
        "id": "ward_17759",
        "label": "Xã Sơn Lâm"
      },
      {
        "id": "ward_17743",
        "label": "Xã Tam Đồng"
      },
      {
        "id": "ward_17059",
        "label": "Xã Tam Hợp"
      },
      {
        "id": "ward_16933",
        "label": "Xã Tam Quang"
      },
      {
        "id": "ward_16936",
        "label": "Xã Tam Thái"
      },
      {
        "id": "ward_17305",
        "label": "Xã Tân An"
      },
      {
        "id": "ward_17488",
        "label": "Xã Tân Châu"
      },
      {
        "id": "ward_17266",
        "label": "Xã Tân Kỳ"
      },
      {
        "id": "ward_17272",
        "label": "Xã Tân Phú"
      },
      {
        "id": "ward_17335",
        "label": "Xã Thành Bình Thọ"
      },
      {
        "id": "ward_17842",
        "label": "Xã Thần Lĩnh"
      },
      {
        "id": "ward_17989",
        "label": "Xã Thiên Nhẫn"
      },
      {
        "id": "ward_16744",
        "label": "Xã Thông Thụ"
      },
      {
        "id": "ward_17689",
        "label": "Xã Thuần Trung"
      },
      {
        "id": "ward_17287",
        "label": "Xã Tiên Đồng"
      },
      {
        "id": "ward_16750",
        "label": "Xã Tiền Phong"
      },
      {
        "id": "ward_16756",
        "label": "Xã Tri Lễ"
      },
      {
        "id": "ward_17866",
        "label": "Xã Trung Lộc"
      },
      {
        "id": "ward_16876",
        "label": "Xã Tương Dương"
      },
      {
        "id": "ward_17950",
        "label": "Xã Vạn An"
      },
      {
        "id": "ward_17677",
        "label": "Xã Văn Hiến"
      },
      {
        "id": "ward_17854",
        "label": "Xã Văn Kiều"
      },
      {
        "id": "ward_17560",
        "label": "Xã Vân Du"
      },
      {
        "id": "ward_17611",
        "label": "Xã Vân Tụ"
      },
      {
        "id": "ward_17357",
        "label": "Xã Vĩnh Tường"
      },
      {
        "id": "ward_17779",
        "label": "Xã Xuân Lâm"
      },
      {
        "id": "ward_16909",
        "label": "Xã Yên Hòa"
      },
      {
        "id": "ward_16912",
        "label": "Xã Yên Na"
      },
      {
        "id": "ward_17506",
        "label": "Xã Yên Thành"
      },
      {
        "id": "ward_18007",
        "label": "Xã Yên Trung"
      },
      {
        "id": "ward_17380",
        "label": "Xã Yên Xuân"
      }
    ]
  },
  {
    "id": "ninh_binh",
    "label": "Ninh Bình",
    "wards": [
      {
        "id": "ward_13318",
        "label": "Phường Châu Sơn"
      },
      {
        "id": "ward_13336",
        "label": "Phường Duy Hà"
      },
      {
        "id": "ward_13330",
        "label": "Phường Duy Tân"
      },
      {
        "id": "ward_13324",
        "label": "Phường Duy Tiên"
      },
      {
        "id": "ward_13693",
        "label": "Phường Đông A"
      },
      {
        "id": "ward_14566",
        "label": "Phường Đông Hoa Lư"
      },
      {
        "id": "ward_13348",
        "label": "Phường Đồng Văn"
      },
      {
        "id": "ward_13366",
        "label": "Phường Hà Nam"
      },
      {
        "id": "ward_14329",
        "label": "Phường Hoa Lư"
      },
      {
        "id": "ward_13984",
        "label": "Phường Hồng Quang"
      },
      {
        "id": "ward_13384",
        "label": "Phường Kim Bảng"
      },
      {
        "id": "ward_13402",
        "label": "Phường Kim Thanh"
      },
      {
        "id": "ward_13393",
        "label": "Phường Lê Hồ"
      },
      {
        "id": "ward_13444",
        "label": "Phường Liêm Tuyền"
      },
      {
        "id": "ward_13435",
        "label": "Phường Lý Thường Kiệt"
      },
      {
        "id": "ward_13708",
        "label": "Phường Mỹ Lộc"
      },
      {
        "id": "ward_13669",
        "label": "Phường Nam Định"
      },
      {
        "id": "ward_14359",
        "label": "Phường Nam Hoa Lư"
      },
      {
        "id": "ward_13396",
        "label": "Phường Nguyễn Úy"
      },
      {
        "id": "ward_13285",
        "label": "Phường Phủ Lý"
      },
      {
        "id": "ward_13291",
        "label": "Phường Phù Vân"
      },
      {
        "id": "ward_13420",
        "label": "Phường Tam Chúc"
      },
      {
        "id": "ward_14362",
        "label": "Phường Tam Điệp"
      },
      {
        "id": "ward_14533",
        "label": "Phường Tây Hoa Lư"
      },
      {
        "id": "ward_13699",
        "label": "Phường Thành Nam"
      },
      {
        "id": "ward_13684",
        "label": "Phường Thiên Trường"
      },
      {
        "id": "ward_13363",
        "label": "Phường Tiên Sơn"
      },
      {
        "id": "ward_14365",
        "label": "Phường Trung Sơn"
      },
      {
        "id": "ward_13777",
        "label": "Phường Trường Thi"
      },
      {
        "id": "ward_13972",
        "label": "Phường Vị Khê"
      },
      {
        "id": "ward_14371",
        "label": "Phường Yên Sơn"
      },
      {
        "id": "ward_14725",
        "label": "Phường Yên Thắng"
      },
      {
        "id": "ward_13579",
        "label": "Xã Bắc Lý"
      },
      {
        "id": "ward_13540",
        "label": "Xã Bình An"
      },
      {
        "id": "ward_13531",
        "label": "Xã Bình Giang"
      },
      {
        "id": "ward_13504",
        "label": "Xã Bình Lục"
      },
      {
        "id": "ward_14623",
        "label": "Xã Bình Minh"
      },
      {
        "id": "ward_13501",
        "label": "Xã Bình Mỹ"
      },
      {
        "id": "ward_13558",
        "label": "Xã Bình Sơn"
      },
      {
        "id": "ward_14056",
        "label": "Xã Cát Thành"
      },
      {
        "id": "ward_14653",
        "label": "Xã Chất Bình"
      },
      {
        "id": "ward_14026",
        "label": "Xã Cổ Lễ"
      },
      {
        "id": "ward_14404",
        "label": "Xã Cúc Phương"
      },
      {
        "id": "ward_14500",
        "label": "Xã Đại Hoàng"
      },
      {
        "id": "ward_14677",
        "label": "Xã Định Hóa"
      },
      {
        "id": "ward_14746",
        "label": "Xã Đồng Thái"
      },
      {
        "id": "ward_13900",
        "label": "Xã Đồng Thịnh"
      },
      {
        "id": "ward_14482",
        "label": "Xã Gia Hưng"
      },
      {
        "id": "ward_14389",
        "label": "Xã Gia Lâm"
      },
      {
        "id": "ward_14524",
        "label": "Xã Gia Phong"
      },
      {
        "id": "ward_14494",
        "label": "Xã Gia Trấn"
      },
      {
        "id": "ward_14401",
        "label": "Xã Gia Tường"
      },
      {
        "id": "ward_14488",
        "label": "Xã Gia Vân"
      },
      {
        "id": "ward_14464",
        "label": "Xã Gia Viễn"
      },
      {
        "id": "ward_14194",
        "label": "Xã Giao Bình"
      },
      {
        "id": "ward_14182",
        "label": "Xã Giao Hòa"
      },
      {
        "id": "ward_14179",
        "label": "Xã Giao Hưng"
      },
      {
        "id": "ward_14161",
        "label": "Xã Giao Minh"
      },
      {
        "id": "ward_14212",
        "label": "Xã Giao Ninh"
      },
      {
        "id": "ward_14203",
        "label": "Xã Giao Phúc"
      },
      {
        "id": "ward_14167",
        "label": "Xã Giao Thủy"
      },
      {
        "id": "ward_14281",
        "label": "Xã Hải An"
      },
      {
        "id": "ward_14236",
        "label": "Xã Hải Anh"
      },
      {
        "id": "ward_14215",
        "label": "Xã Hải Hậu"
      },
      {
        "id": "ward_14248",
        "label": "Xã Hải Hưng"
      },
      {
        "id": "ward_14287",
        "label": "Xã Hải Quang"
      },
      {
        "id": "ward_14221",
        "label": "Xã Hải Thịnh"
      },
      {
        "id": "ward_14218",
        "label": "Xã Hải Tiến"
      },
      {
        "id": "ward_14308",
        "label": "Xã Hải Xuân"
      },
      {
        "id": "ward_13753",
        "label": "Xã Hiển Khánh"
      },
      {
        "id": "ward_13927",
        "label": "Xã Hồng Phong"
      },
      {
        "id": "ward_14614",
        "label": "Xã Khánh Hội"
      },
      {
        "id": "ward_14611",
        "label": "Xã Khánh Nhạc"
      },
      {
        "id": "ward_14563",
        "label": "Xã Khánh Thiện"
      },
      {
        "id": "ward_14608",
        "label": "Xã Khánh Trung"
      },
      {
        "id": "ward_14698",
        "label": "Xã Kim Đông"
      },
      {
        "id": "ward_14638",
        "label": "Xã Kim Sơn"
      },
      {
        "id": "ward_14674",
        "label": "Xã Lai Thành"
      },
      {
        "id": "ward_13456",
        "label": "Xã Liêm Hà"
      },
      {
        "id": "ward_13786",
        "label": "Xã Liên Minh"
      },
      {
        "id": "ward_13573",
        "label": "Xã Lý Nhân"
      },
      {
        "id": "ward_13750",
        "label": "Xã Minh Tân"
      },
      {
        "id": "ward_14071",
        "label": "Xã Minh Thái"
      },
      {
        "id": "ward_14014",
        "label": "Xã Nam Đồng"
      },
      {
        "id": "ward_13987",
        "label": "Xã Nam Hồng"
      },
      {
        "id": "ward_13627",
        "label": "Xã Nam Lý"
      },
      {
        "id": "ward_14011",
        "label": "Xã Nam Minh"
      },
      {
        "id": "ward_14005",
        "label": "Xã Nam Ninh"
      },
      {
        "id": "ward_13966",
        "label": "Xã Nam Trực"
      },
      {
        "id": "ward_13591",
        "label": "Xã Nam Xang"
      },
      {
        "id": "ward_13891",
        "label": "Xã Nghĩa Hưng"
      },
      {
        "id": "ward_13957",
        "label": "Xã Nghĩa Lâm"
      },
      {
        "id": "ward_13918",
        "label": "Xã Nghĩa Sơn"
      },
      {
        "id": "ward_13609",
        "label": "Xã Nhân Hà"
      },
      {
        "id": "ward_14428",
        "label": "Xã Nho Quan"
      },
      {
        "id": "ward_14077",
        "label": "Xã Ninh Cường"
      },
      {
        "id": "ward_14038",
        "label": "Xã Ninh Giang"
      },
      {
        "id": "ward_14620",
        "label": "Xã Phát Diệm"
      },
      {
        "id": "ward_13822",
        "label": "Xã Phong Doanh"
      },
      {
        "id": "ward_14458",
        "label": "Xã Phú Long"
      },
      {
        "id": "ward_14407",
        "label": "Xã Phú Sơn"
      },
      {
        "id": "ward_14062",
        "label": "Xã Quang Hưng"
      },
      {
        "id": "ward_14647",
        "label": "Xã Quang Thiện"
      },
      {
        "id": "ward_13939",
        "label": "Xã Quỹ Nhất"
      },
      {
        "id": "ward_14452",
        "label": "Xã Quỳnh Lưu"
      },
      {
        "id": "ward_13894",
        "label": "Xã Rạng Đông"
      },
      {
        "id": "ward_13807",
        "label": "Xã Tân Minh"
      },
      {
        "id": "ward_13474",
        "label": "Xã Tân Thanh"
      },
      {
        "id": "ward_13483",
        "label": "Xã Thanh Bình"
      },
      {
        "id": "ward_13489",
        "label": "Xã Thanh Lâm"
      },
      {
        "id": "ward_13495",
        "label": "Xã Thanh Liêm"
      },
      {
        "id": "ward_14434",
        "label": "Xã Thanh Sơn"
      },
      {
        "id": "ward_13594",
        "label": "Xã Trần Thương"
      },
      {
        "id": "ward_14053",
        "label": "Xã Trực Ninh"
      },
      {
        "id": "ward_13864",
        "label": "Xã Vạn Thắng"
      },
      {
        "id": "ward_13597",
        "label": "Xã Vĩnh Trụ"
      },
      {
        "id": "ward_13741",
        "label": "Xã Vụ Bản"
      },
      {
        "id": "ward_13834",
        "label": "Xã Vũ Dương"
      },
      {
        "id": "ward_14104",
        "label": "Xã Xuân Giang"
      },
      {
        "id": "ward_14095",
        "label": "Xã Xuân Hồng"
      },
      {
        "id": "ward_14122",
        "label": "Xã Xuân Hưng"
      },
      {
        "id": "ward_14089",
        "label": "Xã Xuân Trường"
      },
      {
        "id": "ward_13795",
        "label": "Xã Ý Yên"
      },
      {
        "id": "ward_13870",
        "label": "Xã Yên Cường"
      },
      {
        "id": "ward_13879",
        "label": "Xã Yên Đồng"
      },
      {
        "id": "ward_14560",
        "label": "Xã Yên Khánh"
      },
      {
        "id": "ward_14743",
        "label": "Xã Yên Mạc"
      },
      {
        "id": "ward_14701",
        "label": "Xã Yên Mô"
      },
      {
        "id": "ward_14728",
        "label": "Xã Yên Từ"
      }
    ]
  },
  {
    "id": "phu_tho",
    "label": "Phú Thọ",
    "wards": [
      {
        "id": "ward_07948",
        "label": "Phường Âu Cơ"
      },
      {
        "id": "ward_04795",
        "label": "Phường Hòa Bình"
      },
      {
        "id": "ward_04894",
        "label": "Phường Kỳ Sơn"
      },
      {
        "id": "ward_07894",
        "label": "Phường Nông Trang"
      },
      {
        "id": "ward_07954",
        "label": "Phường Phong Châu"
      },
      {
        "id": "ward_07942",
        "label": "Phường Phú Thọ"
      },
      {
        "id": "ward_08740",
        "label": "Phường Phúc Yên"
      },
      {
        "id": "ward_04792",
        "label": "Phường Tân Hòa"
      },
      {
        "id": "ward_07909",
        "label": "Phường Thanh Miếu"
      },
      {
        "id": "ward_04828",
        "label": "Phường Thống Nhất"
      },
      {
        "id": "ward_07918",
        "label": "Phường Vân Phú"
      },
      {
        "id": "ward_07900",
        "label": "Phường Việt Trì"
      },
      {
        "id": "ward_08716",
        "label": "Phường Vĩnh Phúc"
      },
      {
        "id": "ward_08707",
        "label": "Phường Vĩnh Yên"
      },
      {
        "id": "ward_08746",
        "label": "Phường Xuân Hòa"
      },
      {
        "id": "ward_05425",
        "label": "Xã An Bình"
      },
      {
        "id": "ward_05395",
        "label": "Xã An Nghĩa"
      },
      {
        "id": "ward_08527",
        "label": "Xã Bản Nguyên"
      },
      {
        "id": "ward_05245",
        "label": "Xã Bao La"
      },
      {
        "id": "ward_07996",
        "label": "Xã Bằng Luân"
      },
      {
        "id": "ward_08935",
        "label": "Xã Bình Nguyên"
      },
      {
        "id": "ward_08275",
        "label": "Xã Bình Phú"
      },
      {
        "id": "ward_08944",
        "label": "Xã Bình Tuyền"
      },
      {
        "id": "ward_08950",
        "label": "Xã Bình Xuyên"
      },
      {
        "id": "ward_05047",
        "label": "Xã Cao Dương"
      },
      {
        "id": "ward_05089",
        "label": "Xã Cao Phong"
      },
      {
        "id": "ward_04876",
        "label": "Xã Cao Sơn"
      },
      {
        "id": "ward_08341",
        "label": "Xã Cẩm Khê"
      },
      {
        "id": "ward_08038",
        "label": "Xã Chân Mộng"
      },
      {
        "id": "ward_07999",
        "label": "Xã Chí Đám"
      },
      {
        "id": "ward_08218",
        "label": "Xã Chí Tiên"
      },
      {
        "id": "ward_08614",
        "label": "Xã Cự Đồng"
      },
      {
        "id": "ward_08254",
        "label": "Xã Dân Chủ"
      },
      {
        "id": "ward_05086",
        "label": "Xã Dũng Tiến"
      },
      {
        "id": "ward_04831",
        "label": "Xã Đà Bắc"
      },
      {
        "id": "ward_08923",
        "label": "Xã Đại Đình"
      },
      {
        "id": "ward_05347",
        "label": "Xã Đại Đồng"
      },
      {
        "id": "ward_08071",
        "label": "Xã Đan Thượng"
      },
      {
        "id": "ward_08914",
        "label": "Xã Đạo Trù"
      },
      {
        "id": "ward_08662",
        "label": "Xã Đào Xá"
      },
      {
        "id": "ward_07969",
        "label": "Xã Đoan Hùng"
      },
      {
        "id": "ward_08431",
        "label": "Xã Đồng Lương"
      },
      {
        "id": "ward_08209",
        "label": "Xã Đông Thành"
      },
      {
        "id": "ward_04846",
        "label": "Xã Đức Nhàn"
      },
      {
        "id": "ward_08053",
        "label": "Xã Hạ Hòa"
      },
      {
        "id": "ward_08782",
        "label": "Xã Hải Lựu"
      },
      {
        "id": "ward_08110",
        "label": "Xã Hiền Lương"
      },
      {
        "id": "ward_08443",
        "label": "Xã Hiền Quan"
      },
      {
        "id": "ward_08896",
        "label": "Xã Hoàng An"
      },
      {
        "id": "ward_08203",
        "label": "Xã Hoàng Cương"
      },
      {
        "id": "ward_08905",
        "label": "Xã Hội Thịnh"
      },
      {
        "id": "ward_05068",
        "label": "Xã Hợp Kim"
      },
      {
        "id": "ward_08770",
        "label": "Xã Hợp Lý"
      },
      {
        "id": "ward_08416",
        "label": "Xã Hùng Việt"
      },
      {
        "id": "ward_08632",
        "label": "Xã Hương Cần"
      },
      {
        "id": "ward_08515",
        "label": "Xã Hy Cương"
      },
      {
        "id": "ward_08635",
        "label": "Xã Khả Cửu"
      },
      {
        "id": "ward_04978",
        "label": "Xã Kim Bôi"
      },
      {
        "id": "ward_05362",
        "label": "Xã Lạc Lương"
      },
      {
        "id": "ward_05266",
        "label": "Xã Lạc Sơn"
      },
      {
        "id": "ward_05392",
        "label": "Xã Lạc Thủy"
      },
      {
        "id": "ward_08560",
        "label": "Xã Lai Đồng"
      },
      {
        "id": "ward_08494",
        "label": "Xã Lâm Thao"
      },
      {
        "id": "ward_08761",
        "label": "Xã Lập Thạch"
      },
      {
        "id": "ward_09064",
        "label": "Xã Liên Châu"
      },
      {
        "id": "ward_08812",
        "label": "Xã Liên Hòa"
      },
      {
        "id": "ward_08227",
        "label": "Xã Liên Minh"
      },
      {
        "id": "ward_04960",
        "label": "Xã Liên Sơn"
      },
      {
        "id": "ward_08620",
        "label": "Xã Long Cốc"
      },
      {
        "id": "ward_04924",
        "label": "Xã Lương Sơn"
      },
      {
        "id": "ward_05200",
        "label": "Xã Mai Châu"
      },
      {
        "id": "ward_05251",
        "label": "Xã Mai Hạ"
      },
      {
        "id": "ward_08593",
        "label": "Xã Minh Đài"
      },
      {
        "id": "ward_08338",
        "label": "Xã Minh Hòa"
      },
      {
        "id": "ward_05158",
        "label": "Xã Mường Bi"
      },
      {
        "id": "ward_05014",
        "label": "Xã Mường Động"
      },
      {
        "id": "ward_05134",
        "label": "Xã Mường Hoa"
      },
      {
        "id": "ward_05116",
        "label": "Xã Mường Thàng"
      },
      {
        "id": "ward_05287",
        "label": "Xã Mường Vang"
      },
      {
        "id": "ward_04990",
        "label": "Xã Nật Sơn"
      },
      {
        "id": "ward_05329",
        "label": "Xã Ngọc Sơn"
      },
      {
        "id": "ward_09052",
        "label": "Xã Nguyệt Đức"
      },
      {
        "id": "ward_05290",
        "label": "Xã Nhân Nghĩa"
      },
      {
        "id": "ward_05212",
        "label": "Xã Pà Cò"
      },
      {
        "id": "ward_08398",
        "label": "Xã Phú Khê"
      },
      {
        "id": "ward_08236",
        "label": "Xã Phú Mỹ"
      },
      {
        "id": "ward_08230",
        "label": "Xã Phù Ninh"
      },
      {
        "id": "ward_08521",
        "label": "Xã Phùng Nguyên"
      },
      {
        "id": "ward_08173",
        "label": "Xã Quảng Yên"
      },
      {
        "id": "ward_04873",
        "label": "Xã Quy Đức"
      },
      {
        "id": "ward_05323",
        "label": "Xã Quyết Thắng"
      },
      {
        "id": "ward_08848",
        "label": "Xã Sông Lô"
      },
      {
        "id": "ward_08866",
        "label": "Xã Sơn Đông"
      },
      {
        "id": "ward_08296",
        "label": "Xã Sơn Lương"
      },
      {
        "id": "ward_08869",
        "label": "Xã Tam Dương"
      },
      {
        "id": "ward_08872",
        "label": "Xã Tam Dương Bắc"
      },
      {
        "id": "ward_08911",
        "label": "Xã Tam Đảo"
      },
      {
        "id": "ward_09043",
        "label": "Xã Tam Hồng"
      },
      {
        "id": "ward_08434",
        "label": "Xã Tam Nông"
      },
      {
        "id": "ward_08824",
        "label": "Xã Tam Sơn"
      },
      {
        "id": "ward_05128",
        "label": "Xã Tân Lạc"
      },
      {
        "id": "ward_05206",
        "label": "Xã Tân Mai"
      },
      {
        "id": "ward_04849",
        "label": "Xã Tân Pheo"
      },
      {
        "id": "ward_08566",
        "label": "Xã Tân Sơn"
      },
      {
        "id": "ward_08023",
        "label": "Xã Tây Cốc"
      },
      {
        "id": "ward_09040",
        "label": "Xã Tề Lỗ"
      },
      {
        "id": "ward_08788",
        "label": "Xã Thái Hòa"
      },
      {
        "id": "ward_08152",
        "label": "Xã Thanh Ba"
      },
      {
        "id": "ward_08542",
        "label": "Xã Thanh Sơn"
      },
      {
        "id": "ward_08674",
        "label": "Xã Thanh Thủy"
      },
      {
        "id": "ward_04897",
        "label": "Xã Thịnh Minh"
      },
      {
        "id": "ward_08479",
        "label": "Xã Thọ Văn"
      },
      {
        "id": "ward_09112",
        "label": "Xã Thổ Tang"
      },
      {
        "id": "ward_08545",
        "label": "Xã Thu Cúc"
      },
      {
        "id": "ward_05092",
        "label": "Xã Thung Nai"
      },
      {
        "id": "ward_05293",
        "label": "Xã Thượng Cốc"
      },
      {
        "id": "ward_08323",
        "label": "Xã Thượng Long"
      },
      {
        "id": "ward_08842",
        "label": "Xã Tiên Lữ"
      },
      {
        "id": "ward_08344",
        "label": "Xã Tiên Lương"
      },
      {
        "id": "ward_04891",
        "label": "Xã Tiền Phong"
      },
      {
        "id": "ward_05191",
        "label": "Xã Toàn Thắng"
      },
      {
        "id": "ward_08245",
        "label": "Xã Trạm Thản"
      },
      {
        "id": "ward_08311",
        "label": "Xã Trung Sơn"
      },
      {
        "id": "ward_08686",
        "label": "Xã Tu Vũ"
      },
      {
        "id": "ward_08467",
        "label": "Xã Vạn Xuân"
      },
      {
        "id": "ward_08134",
        "label": "Xã Văn Lang"
      },
      {
        "id": "ward_08611",
        "label": "Xã Văn Miếu"
      },
      {
        "id": "ward_08377",
        "label": "Xã Vân Bán"
      },
      {
        "id": "ward_05152",
        "label": "Xã Vân Sơn"
      },
      {
        "id": "ward_09079",
        "label": "Xã Vĩnh An"
      },
      {
        "id": "ward_08143",
        "label": "Xã Vĩnh Chân"
      },
      {
        "id": "ward_09100",
        "label": "Xã Vĩnh Hưng"
      },
      {
        "id": "ward_09154",
        "label": "Xã Vĩnh Phú"
      },
      {
        "id": "ward_09106",
        "label": "Xã Vĩnh Thành"
      },
      {
        "id": "ward_09076",
        "label": "Xã Vĩnh Tường"
      },
      {
        "id": "ward_08584",
        "label": "Xã Võ Miếu"
      },
      {
        "id": "ward_08590",
        "label": "Xã Xuân Đài"
      },
      {
        "id": "ward_08971",
        "label": "Xã Xuân Lãng"
      },
      {
        "id": "ward_08500",
        "label": "Xã Xuân Lũng"
      },
      {
        "id": "ward_08305",
        "label": "Xã Xuân Viên"
      },
      {
        "id": "ward_08113",
        "label": "Xã Yên Kỳ"
      },
      {
        "id": "ward_09025",
        "label": "Xã Yên Lạc"
      },
      {
        "id": "ward_08773",
        "label": "Xã Yên Lãng"
      },
      {
        "id": "ward_08290",
        "label": "Xã Yên Lập"
      },
      {
        "id": "ward_05305",
        "label": "Xã Yên Phú"
      },
      {
        "id": "ward_08656",
        "label": "Xã Yên Sơn"
      },
      {
        "id": "ward_05353",
        "label": "Xã Yên Thủy"
      },
      {
        "id": "ward_05386",
        "label": "Xã Yên Trị"
      }
    ]
  },
  {
    "id": "quang_ngai",
    "label": "Quảng Ngãi",
    "wards": [
      {
        "id": "ward_21548",
        "label": "Đặc khu Lý Sơn"
      },
      {
        "id": "ward_21025",
        "label": "Phường Cẩm Thành"
      },
      {
        "id": "ward_23302",
        "label": "Phường Đăk Bla"
      },
      {
        "id": "ward_23284",
        "label": "Phường Đăk Cấm"
      },
      {
        "id": "ward_21439",
        "label": "Phường Đức Phổ"
      },
      {
        "id": "ward_23293",
        "label": "Phường Kon Tum"
      },
      {
        "id": "ward_21028",
        "label": "Phường Nghĩa Lộ"
      },
      {
        "id": "ward_21478",
        "label": "Phường Sa Huỳnh"
      },
      {
        "id": "ward_21451",
        "label": "Phường Trà Câu"
      },
      {
        "id": "ward_21172",
        "label": "Phường Trương Quang Trọng"
      },
      {
        "id": "ward_21034",
        "label": "Xã An Phú"
      },
      {
        "id": "ward_21499",
        "label": "Xã Ba Dinh"
      },
      {
        "id": "ward_21496",
        "label": "Xã Ba Động"
      },
      {
        "id": "ward_21205",
        "label": "Xã Ba Gia"
      },
      {
        "id": "ward_21523",
        "label": "Xã Ba Tô"
      },
      {
        "id": "ward_21484",
        "label": "Xã Ba Tơ"
      },
      {
        "id": "ward_21529",
        "label": "Xã Ba Vì"
      },
      {
        "id": "ward_21490",
        "label": "Xã Ba Vinh"
      },
      {
        "id": "ward_21538",
        "label": "Xã Ba Xa"
      },
      {
        "id": "ward_21100",
        "label": "Xã Bình Chương"
      },
      {
        "id": "ward_21085",
        "label": "Xã Bình Minh"
      },
      {
        "id": "ward_21040",
        "label": "Xã Bình Sơn"
      },
      {
        "id": "ward_23377",
        "label": "Xã Bờ Y"
      },
      {
        "id": "ward_21136",
        "label": "Xã Cà Đam"
      },
      {
        "id": "ward_23383",
        "label": "Xã Dục Nông"
      },
      {
        "id": "ward_23500",
        "label": "Xã Đăk Hà"
      },
      {
        "id": "ward_23485",
        "label": "Xã Đăk Kôi"
      },
      {
        "id": "ward_23368",
        "label": "Xã Đăk Long"
      },
      {
        "id": "ward_23512",
        "label": "Xã Đăk Mar"
      },
      {
        "id": "ward_23374",
        "label": "Xã Đăk Môn"
      },
      {
        "id": "ward_23341",
        "label": "Xã Đăk Pék"
      },
      {
        "id": "ward_23344",
        "label": "Xã Đăk Plô"
      },
      {
        "id": "ward_23504",
        "label": "Xã Đăk Pxi"
      },
      {
        "id": "ward_23332",
        "label": "Xã Đăk Rơ Wa"
      },
      {
        "id": "ward_23479",
        "label": "Xã Đăk Rve"
      },
      {
        "id": "ward_23416",
        "label": "Xã Đăk Sao"
      },
      {
        "id": "ward_23401",
        "label": "Xã Đăk Tô"
      },
      {
        "id": "ward_23419",
        "label": "Xã Đăk Tờ Kan"
      },
      {
        "id": "ward_23510",
        "label": "Xã Đăk Ui"
      },
      {
        "id": "ward_21520",
        "label": "Xã Đặng Thùy Trâm"
      },
      {
        "id": "ward_21385",
        "label": "Xã Đình Cương"
      },
      {
        "id": "ward_21109",
        "label": "Xã Đông Sơn"
      },
      {
        "id": "ward_21127",
        "label": "Xã Đông Trà Bồng"
      },
      {
        "id": "ward_23326",
        "label": "Xã Ia Chim"
      },
      {
        "id": "ward_23535",
        "label": "Xã Ia Đal"
      },
      {
        "id": "ward_23538",
        "label": "Xã Ia Tơi"
      },
      {
        "id": "ward_21472",
        "label": "Xã Khánh Cường"
      },
      {
        "id": "ward_23497",
        "label": "Xã Kon Braih"
      },
      {
        "id": "ward_23430",
        "label": "Xã Kon Đào"
      },
      {
        "id": "ward_23476",
        "label": "Xã Kon Plông"
      },
      {
        "id": "ward_21433",
        "label": "Xã Lân Phong"
      },
      {
        "id": "ward_21409",
        "label": "Xã Long Phụng"
      },
      {
        "id": "ward_23455",
        "label": "Xã Măng Bút"
      },
      {
        "id": "ward_23473",
        "label": "Xã Măng Đen"
      },
      {
        "id": "ward_23446",
        "label": "Xã Măng Ri"
      },
      {
        "id": "ward_21361",
        "label": "Xã Minh Long"
      },
      {
        "id": "ward_21421",
        "label": "Xã Mỏ Cày"
      },
      {
        "id": "ward_21400",
        "label": "Xã Mộ Đức"
      },
      {
        "id": "ward_23536",
        "label": "Xã Mô Rai"
      },
      {
        "id": "ward_21250",
        "label": "Xã Nghĩa Giang"
      },
      {
        "id": "ward_21364",
        "label": "Xã Nghĩa Hành"
      },
      {
        "id": "ward_23365",
        "label": "Xã Ngọc Linh"
      },
      {
        "id": "ward_23317",
        "label": "Xã Ngọk Bay"
      },
      {
        "id": "ward_23515",
        "label": "Xã Ngọk Réo"
      },
      {
        "id": "ward_23428",
        "label": "Xã Ngọk Tụ"
      },
      {
        "id": "ward_21457",
        "label": "Xã Nguyễn Nghiêm"
      },
      {
        "id": "ward_21370",
        "label": "Xã Phước Giang"
      },
      {
        "id": "ward_23530",
        "label": "Xã Rờ Kơi"
      },
      {
        "id": "ward_23534",
        "label": "Xã Sa Bình"
      },
      {
        "id": "ward_23392",
        "label": "Xã Sa Loong"
      },
      {
        "id": "ward_23527",
        "label": "Xã Sa Thầy"
      },
      {
        "id": "ward_21289",
        "label": "Xã Sơn Hà"
      },
      {
        "id": "ward_21292",
        "label": "Xã Sơn Hạ"
      },
      {
        "id": "ward_21325",
        "label": "Xã Sơn Kỳ"
      },
      {
        "id": "ward_21307",
        "label": "Xã Sơn Linh"
      },
      {
        "id": "ward_21349",
        "label": "Xã Sơn Mai"
      },
      {
        "id": "ward_21340",
        "label": "Xã Sơn Tây"
      },
      {
        "id": "ward_21343",
        "label": "Xã Sơn Tây Hạ"
      },
      {
        "id": "ward_21334",
        "label": "Xã Sơn Tây Thượng"
      },
      {
        "id": "ward_21319",
        "label": "Xã Sơn Thủy"
      },
      {
        "id": "ward_21220",
        "label": "Xã Sơn Tịnh"
      },
      {
        "id": "ward_21154",
        "label": "Xã Tây Trà"
      },
      {
        "id": "ward_21157",
        "label": "Xã Tây Trà Bồng"
      },
      {
        "id": "ward_21124",
        "label": "Xã Thanh Bồng"
      },
      {
        "id": "ward_21388",
        "label": "Xã Thiện Tín"
      },
      {
        "id": "ward_21181",
        "label": "Xã Thọ Phong"
      },
      {
        "id": "ward_21211",
        "label": "Xã Tịnh Khê"
      },
      {
        "id": "ward_21115",
        "label": "Xã Trà Bồng"
      },
      {
        "id": "ward_21244",
        "label": "Xã Trà Giang"
      },
      {
        "id": "ward_21196",
        "label": "Xã Trường Giang"
      },
      {
        "id": "ward_23425",
        "label": "Xã Tu Mơ Rông"
      },
      {
        "id": "ward_21235",
        "label": "Xã Tư Nghĩa"
      },
      {
        "id": "ward_21061",
        "label": "Xã Vạn Tường"
      },
      {
        "id": "ward_21238",
        "label": "Xã Vệ Giang"
      },
      {
        "id": "ward_23356",
        "label": "Xã Xốp"
      },
      {
        "id": "ward_23548",
        "label": "Xã Ya Ly"
      }
    ]
  },
  {
    "id": "quang_ninh",
    "label": "Quảng Ninh",
    "wards": [
      {
        "id": "ward_07192",
        "label": "Đặc khu Cô Tô"
      },
      {
        "id": "ward_06994",
        "label": "Đặc khu Vân Đồn"
      },
      {
        "id": "ward_07090",
        "label": "Phường An Sinh"
      },
      {
        "id": "ward_06673",
        "label": "Phường Bãi Cháy"
      },
      {
        "id": "ward_07081",
        "label": "Phường Bình Khê"
      },
      {
        "id": "ward_06658",
        "label": "Phường Cao Xanh"
      },
      {
        "id": "ward_06793",
        "label": "Phường Cẩm Phả"
      },
      {
        "id": "ward_06781",
        "label": "Phường Cửa Ông"
      },
      {
        "id": "ward_07135",
        "label": "Phường Đông Mai"
      },
      {
        "id": "ward_07093",
        "label": "Phường Đông Triều"
      },
      {
        "id": "ward_07168",
        "label": "Phường Hà An"
      },
      {
        "id": "ward_06676",
        "label": "Phường Hà Lầm"
      },
      {
        "id": "ward_06688",
        "label": "Phường Hạ Long"
      },
      {
        "id": "ward_06652",
        "label": "Phường Hà Tu"
      },
      {
        "id": "ward_07147",
        "label": "Phường Hiệp Hòa"
      },
      {
        "id": "ward_07114",
        "label": "Phường Hoàng Quế"
      },
      {
        "id": "ward_07030",
        "label": "Phường Hoành Bồ"
      },
      {
        "id": "ward_06685",
        "label": "Phường Hồng Gai"
      },
      {
        "id": "ward_07180",
        "label": "Phường Liên Hòa"
      },
      {
        "id": "ward_07069",
        "label": "Phường Mạo Khê"
      },
      {
        "id": "ward_06712",
        "label": "Phường Móng Cái 1"
      },
      {
        "id": "ward_06709",
        "label": "Phường Móng Cái 2"
      },
      {
        "id": "ward_06736",
        "label": "Phường Móng Cái 3"
      },
      {
        "id": "ward_06760",
        "label": "Phường Mông Dương"
      },
      {
        "id": "ward_07183",
        "label": "Phường Phong Cốc"
      },
      {
        "id": "ward_06778",
        "label": "Phường Quang Hanh"
      },
      {
        "id": "ward_07132",
        "label": "Phường Quảng Yên"
      },
      {
        "id": "ward_06706",
        "label": "Phường Tuần Châu"
      },
      {
        "id": "ward_06811",
        "label": "Phường Uông Bí"
      },
      {
        "id": "ward_06820",
        "label": "Phường Vàng Danh"
      },
      {
        "id": "ward_06661",
        "label": "Phường Việt Hưng"
      },
      {
        "id": "ward_06832",
        "label": "Phường Yên Tử"
      },
      {
        "id": "ward_06970",
        "label": "Xã Ba Chẽ"
      },
      {
        "id": "ward_06838",
        "label": "Xã Bình Liêu"
      },
      {
        "id": "ward_06967",
        "label": "Xã Cái Chiên"
      },
      {
        "id": "ward_06895",
        "label": "Xã Đầm Hà"
      },
      {
        "id": "ward_06874",
        "label": "Xã Điền Xá"
      },
      {
        "id": "ward_06877",
        "label": "Xã Đông Ngũ"
      },
      {
        "id": "ward_06946",
        "label": "Xã Đường Hoa"
      },
      {
        "id": "ward_06799",
        "label": "Xã Hải Hòa"
      },
      {
        "id": "ward_06886",
        "label": "Xã Hải Lạng"
      },
      {
        "id": "ward_06733",
        "label": "Xã Hải Ninh"
      },
      {
        "id": "ward_06724",
        "label": "Xã Hải Sơn"
      },
      {
        "id": "ward_06841",
        "label": "Xã Hoành Mô"
      },
      {
        "id": "ward_06979",
        "label": "Xã Kỳ Thượng"
      },
      {
        "id": "ward_06856",
        "label": "Xã Lục Hồn"
      },
      {
        "id": "ward_06985",
        "label": "Xã Lương Minh"
      },
      {
        "id": "ward_06931",
        "label": "Xã Quảng Đức"
      },
      {
        "id": "ward_06922",
        "label": "Xã Quảng Hà"
      },
      {
        "id": "ward_07054",
        "label": "Xã Quảng La"
      },
      {
        "id": "ward_06913",
        "label": "Xã Quảng Tân"
      },
      {
        "id": "ward_07060",
        "label": "Xã Thống Nhất"
      },
      {
        "id": "ward_06862",
        "label": "Xã Tiên Yên"
      },
      {
        "id": "ward_06757",
        "label": "Xã Vĩnh Thực"
      }
    ]
  },
  {
    "id": "quang_tri",
    "label": "Quảng Trị",
    "wards": [
      {
        "id": "ward_19742",
        "label": "Đặc khu Cồn Cỏ"
      },
      {
        "id": "ward_19009",
        "label": "Phường Ba Đồn"
      },
      {
        "id": "ward_19066",
        "label": "Phường Bắc Gianh"
      },
      {
        "id": "ward_19333",
        "label": "Phường Đông Hà"
      },
      {
        "id": "ward_18880",
        "label": "Phường Đồng Hới"
      },
      {
        "id": "ward_18871",
        "label": "Phường Đồng Sơn"
      },
      {
        "id": "ward_18859",
        "label": "Phường Đồng Thuận"
      },
      {
        "id": "ward_19351",
        "label": "Phường Nam Đông Hà"
      },
      {
        "id": "ward_19360",
        "label": "Phường Quảng Trị"
      },
      {
        "id": "ward_19483",
        "label": "Xã A Dơi"
      },
      {
        "id": "ward_19669",
        "label": "Xã Ái Tử"
      },
      {
        "id": "ward_19567",
        "label": "Xã Ba Lòng"
      },
      {
        "id": "ward_19126",
        "label": "Xã Bắc Trạch"
      },
      {
        "id": "ward_19501",
        "label": "Xã Bến Hải"
      },
      {
        "id": "ward_19366",
        "label": "Xã Bến Quan"
      },
      {
        "id": "ward_19141",
        "label": "Xã Bố Trạch"
      },
      {
        "id": "ward_19255",
        "label": "Xã Cam Hồng"
      },
      {
        "id": "ward_19597",
        "label": "Xã Cam Lộ"
      },
      {
        "id": "ward_19537",
        "label": "Xã Cồn Tiên"
      },
      {
        "id": "ward_19414",
        "label": "Xã Cửa Tùng"
      },
      {
        "id": "ward_19496",
        "label": "Xã Cửa Việt"
      },
      {
        "id": "ward_18904",
        "label": "Xã Dân Hóa"
      },
      {
        "id": "ward_19681",
        "label": "Xã Diên Sanh"
      },
      {
        "id": "ward_19564",
        "label": "Xã Đakrông"
      },
      {
        "id": "ward_18949",
        "label": "Xã Đồng Lê"
      },
      {
        "id": "ward_19159",
        "label": "Xã Đông Trạch"
      },
      {
        "id": "ward_19495",
        "label": "Xã Gio Linh"
      },
      {
        "id": "ward_19702",
        "label": "Xã Hải Lăng"
      },
      {
        "id": "ward_19603",
        "label": "Xã Hiếu Giang"
      },
      {
        "id": "ward_19033",
        "label": "Xã Hòa Trạch"
      },
      {
        "id": "ward_19111",
        "label": "Xã Hoàn Lão"
      },
      {
        "id": "ward_19555",
        "label": "Xã Hướng Hiệp"
      },
      {
        "id": "ward_19435",
        "label": "Xã Hướng Lập"
      },
      {
        "id": "ward_19441",
        "label": "Xã Hướng Phùng"
      },
      {
        "id": "ward_19429",
        "label": "Xã Khe Sanh"
      },
      {
        "id": "ward_18922",
        "label": "Xã Kim Điền"
      },
      {
        "id": "ward_19318",
        "label": "Xã Kim Ngân"
      },
      {
        "id": "ward_18943",
        "label": "Xã Kim Phú"
      },
      {
        "id": "ward_19594",
        "label": "Xã La Lay"
      },
      {
        "id": "ward_19432",
        "label": "Xã Lao Bảo"
      },
      {
        "id": "ward_19246",
        "label": "Xã Lệ Ninh"
      },
      {
        "id": "ward_19249",
        "label": "Xã Lệ Thủy"
      },
      {
        "id": "ward_19489",
        "label": "Xã Lìa"
      },
      {
        "id": "ward_18901",
        "label": "Xã Minh Hóa"
      },
      {
        "id": "ward_19741",
        "label": "Xã Mỹ Thủy"
      },
      {
        "id": "ward_19075",
        "label": "Xã Nam Ba Đồn"
      },
      {
        "id": "ward_19639",
        "label": "Xã Nam Cửa Việt"
      },
      {
        "id": "ward_19093",
        "label": "Xã Nam Gianh"
      },
      {
        "id": "ward_19735",
        "label": "Xã Nam Hải Lăng"
      },
      {
        "id": "ward_19198",
        "label": "Xã Nam Trạch"
      },
      {
        "id": "ward_19225",
        "label": "Xã Ninh Châu"
      },
      {
        "id": "ward_19138",
        "label": "Xã Phong Nha"
      },
      {
        "id": "ward_19021",
        "label": "Xã Phú Trạch"
      },
      {
        "id": "ward_19207",
        "label": "Xã Quảng Ninh"
      },
      {
        "id": "ward_19057",
        "label": "Xã Quảng Trạch"
      },
      {
        "id": "ward_19288",
        "label": "Xã Sen Ngư"
      },
      {
        "id": "ward_19588",
        "label": "Xã Tà Rụt"
      },
      {
        "id": "ward_19051",
        "label": "Xã Tân Gianh"
      },
      {
        "id": "ward_19462",
        "label": "Xã Tân Lập"
      },
      {
        "id": "ward_19291",
        "label": "Xã Tân Mỹ"
      },
      {
        "id": "ward_18919",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_19147",
        "label": "Xã Thượng Trạch"
      },
      {
        "id": "ward_19645",
        "label": "Xã Triệu Bình"
      },
      {
        "id": "ward_19654",
        "label": "Xã Triệu Cơ"
      },
      {
        "id": "ward_19624",
        "label": "Xã Triệu Phong"
      },
      {
        "id": "ward_19030",
        "label": "Xã Trung Thuần"
      },
      {
        "id": "ward_19237",
        "label": "Xã Trường Ninh"
      },
      {
        "id": "ward_19309",
        "label": "Xã Trường Phú"
      },
      {
        "id": "ward_19204",
        "label": "Xã Trường Sơn"
      },
      {
        "id": "ward_18991",
        "label": "Xã Tuyên Bình"
      },
      {
        "id": "ward_18997",
        "label": "Xã Tuyên Hóa"
      },
      {
        "id": "ward_18958",
        "label": "Xã Tuyên Lâm"
      },
      {
        "id": "ward_18985",
        "label": "Xã Tuyên Phú"
      },
      {
        "id": "ward_18952",
        "label": "Xã Tuyên Sơn"
      },
      {
        "id": "ward_19699",
        "label": "Xã Vĩnh Định"
      },
      {
        "id": "ward_19372",
        "label": "Xã Vĩnh Hoàng"
      },
      {
        "id": "ward_19363",
        "label": "Xã Vĩnh Linh"
      },
      {
        "id": "ward_19405",
        "label": "Xã Vĩnh Thủy"
      }
    ]
  },
  {
    "id": "son_la",
    "label": "Sơn La",
    "wards": [
      {
        "id": "ward_03664",
        "label": "Phường Chiềng An"
      },
      {
        "id": "ward_03670",
        "label": "Phường Chiềng Cơi"
      },
      {
        "id": "ward_03679",
        "label": "Phường Chiềng Sinh"
      },
      {
        "id": "ward_03980",
        "label": "Phường Mộc Châu"
      },
      {
        "id": "ward_03979",
        "label": "Phường Mộc Sơn"
      },
      {
        "id": "ward_03982",
        "label": "Phường Thảo Nguyên"
      },
      {
        "id": "ward_03646",
        "label": "Phường Tô Hiệu"
      },
      {
        "id": "ward_04033",
        "label": "Phường Vân Sơn"
      },
      {
        "id": "ward_03856",
        "label": "Xã Bắc Yên"
      },
      {
        "id": "ward_03724",
        "label": "Xã Bình Thuận"
      },
      {
        "id": "ward_04171",
        "label": "Xã Bó Sinh"
      },
      {
        "id": "ward_04078",
        "label": "Xã Chiềng Hặc"
      },
      {
        "id": "ward_03850",
        "label": "Xã Chiềng Hoa"
      },
      {
        "id": "ward_04204",
        "label": "Xã Chiềng Khoong"
      },
      {
        "id": "ward_04222",
        "label": "Xã Chiềng Khương"
      },
      {
        "id": "ward_03754",
        "label": "Xã Chiềng La"
      },
      {
        "id": "ward_03814",
        "label": "Xã Chiềng Lao"
      },
      {
        "id": "ward_04132",
        "label": "Xã Chiềng Mai"
      },
      {
        "id": "ward_04123",
        "label": "Xã Chiềng Mung"
      },
      {
        "id": "ward_03892",
        "label": "Xã Chiềng Sại"
      },
      {
        "id": "ward_04195",
        "label": "Xã Chiềng Sơ"
      },
      {
        "id": "ward_03985",
        "label": "Xã Chiềng Sơn"
      },
      {
        "id": "ward_04108",
        "label": "Xã Chiềng Sung"
      },
      {
        "id": "ward_03781",
        "label": "Xã Co Mạ"
      },
      {
        "id": "ward_04000",
        "label": "Xã Đoàn Kết"
      },
      {
        "id": "ward_03922",
        "label": "Xã Gia Phù"
      },
      {
        "id": "ward_04210",
        "label": "Xã Huổi Một"
      },
      {
        "id": "ward_03961",
        "label": "Xã Kim Bon"
      },
      {
        "id": "ward_03763",
        "label": "Xã Long Hẹ"
      },
      {
        "id": "ward_04096",
        "label": "Xã Lóng Phiêng"
      },
      {
        "id": "ward_04045",
        "label": "Xã Lóng Sập"
      },
      {
        "id": "ward_04105",
        "label": "Xã Mai Sơn"
      },
      {
        "id": "ward_03799",
        "label": "Xã Muổi Nọi"
      },
      {
        "id": "ward_03760",
        "label": "Xã Mường Bám"
      },
      {
        "id": "ward_03943",
        "label": "Xã Mường Bang"
      },
      {
        "id": "ward_03847",
        "label": "Xã Mường Bú"
      },
      {
        "id": "ward_04117",
        "label": "Xã Mường Chanh"
      },
      {
        "id": "ward_03688",
        "label": "Xã Mường Chiên"
      },
      {
        "id": "ward_03907",
        "label": "Xã Mường Cơi"
      },
      {
        "id": "ward_03727",
        "label": "Xã Mường É"
      },
      {
        "id": "ward_03694",
        "label": "Xã Mường Giôn"
      },
      {
        "id": "ward_04219",
        "label": "Xã Mường Hung"
      },
      {
        "id": "ward_03757",
        "label": "Xã Mường Khiêng"
      },
      {
        "id": "ward_03808",
        "label": "Xã Mường La"
      },
      {
        "id": "ward_04246",
        "label": "Xã Mường Lạn"
      },
      {
        "id": "ward_04183",
        "label": "Xã Mường Lầm"
      },
      {
        "id": "ward_04240",
        "label": "Xã Mường Lèo"
      },
      {
        "id": "ward_03712",
        "label": "Xã Mường Sại"
      },
      {
        "id": "ward_03784",
        "label": "Xã Nậm Lầu"
      },
      {
        "id": "ward_04186",
        "label": "Xã Nậm Ty"
      },
      {
        "id": "ward_03820",
        "label": "Xã Ngọc Chiến"
      },
      {
        "id": "ward_03871",
        "label": "Xã Pắc Ngà"
      },
      {
        "id": "ward_04144",
        "label": "Xã Phiêng Cằm"
      },
      {
        "id": "ward_04099",
        "label": "Xã Phiêng Khoài"
      },
      {
        "id": "ward_04159",
        "label": "Xã Phiêng Pằn"
      },
      {
        "id": "ward_03910",
        "label": "Xã Phù Yên"
      },
      {
        "id": "ward_04228",
        "label": "Xã Púng Bánh"
      },
      {
        "id": "ward_03703",
        "label": "Xã Quỳnh Nhai"
      },
      {
        "id": "ward_04006",
        "label": "Xã Song Khủa"
      },
      {
        "id": "ward_04168",
        "label": "Xã Sông Mã"
      },
      {
        "id": "ward_04231",
        "label": "Xã Sốp Cộp"
      },
      {
        "id": "ward_03901",
        "label": "Xã Suối Tọ"
      },
      {
        "id": "ward_04136",
        "label": "Xã Tà Hộc"
      },
      {
        "id": "ward_03880",
        "label": "Xã Tạ Khoa"
      },
      {
        "id": "ward_03868",
        "label": "Xã Tà Xùa"
      },
      {
        "id": "ward_03970",
        "label": "Xã Tân Phong"
      },
      {
        "id": "ward_03997",
        "label": "Xã Tân Yên"
      },
      {
        "id": "ward_03721",
        "label": "Xã Thuận Châu"
      },
      {
        "id": "ward_04018",
        "label": "Xã Tô Múa"
      },
      {
        "id": "ward_03958",
        "label": "Xã Tường Hạ"
      },
      {
        "id": "ward_04048",
        "label": "Xã Vân Hồ"
      },
      {
        "id": "ward_03862",
        "label": "Xã Xím Vàng"
      },
      {
        "id": "ward_04057",
        "label": "Xã Xuân Nha"
      },
      {
        "id": "ward_04075",
        "label": "Xã Yên Châu"
      },
      {
        "id": "ward_04087",
        "label": "Xã Yên Sơn"
      }
    ]
  },
  {
    "id": "tay_ninh",
    "label": "Tây Ninh",
    "wards": [
      {
        "id": "ward_25732",
        "label": "Phường An Tịnh"
      },
      {
        "id": "ward_25480",
        "label": "Phường Bình Minh"
      },
      {
        "id": "ward_25672",
        "label": "Phường Gia Lộc"
      },
      {
        "id": "ward_25654",
        "label": "Phường Gò Dầu"
      },
      {
        "id": "ward_25645",
        "label": "Phường Hòa Thành"
      },
      {
        "id": "ward_27715",
        "label": "Phường Khánh Hậu"
      },
      {
        "id": "ward_27787",
        "label": "Phường Kiến Tường"
      },
      {
        "id": "ward_27694",
        "label": "Phường Long An"
      },
      {
        "id": "ward_25630",
        "label": "Phường Long Hoa"
      },
      {
        "id": "ward_25567",
        "label": "Phường Ninh Thạnh"
      },
      {
        "id": "ward_27712",
        "label": "Phường Tân An"
      },
      {
        "id": "ward_25459",
        "label": "Phường Tân Ninh"
      },
      {
        "id": "ward_25633",
        "label": "Phường Thanh Điền"
      },
      {
        "id": "ward_25708",
        "label": "Phường Trảng Bàng"
      },
      {
        "id": "ward_28243",
        "label": "Xã An Lục Long"
      },
      {
        "id": "ward_27943",
        "label": "Xã An Ninh"
      },
      {
        "id": "ward_25681",
        "label": "Xã Bến Cầu"
      },
      {
        "id": "ward_27991",
        "label": "Xã Bến Lức"
      },
      {
        "id": "ward_28015",
        "label": "Xã Bình Đức"
      },
      {
        "id": "ward_27793",
        "label": "Xã Bình Hiệp"
      },
      {
        "id": "ward_27811",
        "label": "Xã Bình Hòa"
      },
      {
        "id": "ward_27868",
        "label": "Xã Bình Thành"
      },
      {
        "id": "ward_28108",
        "label": "Xã Cần Đước"
      },
      {
        "id": "ward_28159",
        "label": "Xã Cần Giuộc"
      },
      {
        "id": "ward_25573",
        "label": "Xã Cầu Khởi"
      },
      {
        "id": "ward_25585",
        "label": "Xã Châu Thành"
      },
      {
        "id": "ward_25552",
        "label": "Xã Dương Minh Châu"
      },
      {
        "id": "ward_27898",
        "label": "Xã Đông Thành"
      },
      {
        "id": "ward_27937",
        "label": "Xã Đức Hòa"
      },
      {
        "id": "ward_27925",
        "label": "Xã Đức Huệ"
      },
      {
        "id": "ward_27964",
        "label": "Xã Đức Lập"
      },
      {
        "id": "ward_25588",
        "label": "Xã Hảo Đước"
      },
      {
        "id": "ward_27931",
        "label": "Xã Hậu Nghĩa"
      },
      {
        "id": "ward_27841",
        "label": "Xã Hậu Thạnh"
      },
      {
        "id": "ward_27952",
        "label": "Xã Hiệp Hòa"
      },
      {
        "id": "ward_25606",
        "label": "Xã Hòa Hội"
      },
      {
        "id": "ward_27979",
        "label": "Xã Hòa Khánh"
      },
      {
        "id": "ward_27727",
        "label": "Xã Hưng Điền"
      },
      {
        "id": "ward_25711",
        "label": "Xã Hưng Thuận"
      },
      {
        "id": "ward_27763",
        "label": "Xã Khánh Hưng"
      },
      {
        "id": "ward_28126",
        "label": "Xã Long Cang"
      },
      {
        "id": "ward_25684",
        "label": "Xã Long Chữ"
      },
      {
        "id": "ward_28144",
        "label": "Xã Long Hựu"
      },
      {
        "id": "ward_25702",
        "label": "Xã Long Thuận"
      },
      {
        "id": "ward_25579",
        "label": "Xã Lộc Ninh"
      },
      {
        "id": "ward_28003",
        "label": "Xã Lương Hòa"
      },
      {
        "id": "ward_27823",
        "label": "Xã Mộc Hóa"
      },
      {
        "id": "ward_28066",
        "label": "Xã Mỹ An"
      },
      {
        "id": "ward_27976",
        "label": "Xã Mỹ Hạnh"
      },
      {
        "id": "ward_28132",
        "label": "Xã Mỹ Lệ"
      },
      {
        "id": "ward_28177",
        "label": "Xã Mỹ Lộc"
      },
      {
        "id": "ward_27907",
        "label": "Xã Mỹ Quý"
      },
      {
        "id": "ward_28051",
        "label": "Xã Mỹ Thạnh"
      },
      {
        "id": "ward_28018",
        "label": "Xã Mỹ Yên"
      },
      {
        "id": "ward_27838",
        "label": "Xã Nhơn Hòa Lập"
      },
      {
        "id": "ward_27856",
        "label": "Xã Nhơn Ninh"
      },
      {
        "id": "ward_28087",
        "label": "Xã Nhựt Tảo"
      },
      {
        "id": "ward_25621",
        "label": "Xã Ninh Điền"
      },
      {
        "id": "ward_25729",
        "label": "Xã Phước Chỉ"
      },
      {
        "id": "ward_28165",
        "label": "Xã Phước Lý"
      },
      {
        "id": "ward_25663",
        "label": "Xã Phước Thạnh"
      },
      {
        "id": "ward_25591",
        "label": "Xã Phước Vinh"
      },
      {
        "id": "ward_28201",
        "label": "Xã Phước Vĩnh Tây"
      },
      {
        "id": "ward_28114",
        "label": "Xã Rạch Kiến"
      },
      {
        "id": "ward_28210",
        "label": "Xã Tầm Vu"
      },
      {
        "id": "ward_25486",
        "label": "Xã Tân Biên"
      },
      {
        "id": "ward_25516",
        "label": "Xã Tân Châu"
      },
      {
        "id": "ward_25522",
        "label": "Xã Tân Đông"
      },
      {
        "id": "ward_25531",
        "label": "Xã Tân Hòa"
      },
      {
        "id": "ward_25525",
        "label": "Xã Tân Hội"
      },
      {
        "id": "ward_27721",
        "label": "Xã Tân Hưng"
      },
      {
        "id": "ward_28138",
        "label": "Xã Tân Lân"
      },
      {
        "id": "ward_25489",
        "label": "Xã Tân Lập"
      },
      {
        "id": "ward_28072",
        "label": "Xã Tân Long"
      },
      {
        "id": "ward_25549",
        "label": "Xã Tân Phú"
      },
      {
        "id": "ward_28207",
        "label": "Xã Tân Tập"
      },
      {
        "id": "ward_27889",
        "label": "Xã Tân Tây"
      },
      {
        "id": "ward_25534",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_27826",
        "label": "Xã Tân Thạnh"
      },
      {
        "id": "ward_28075",
        "label": "Xã Tân Trụ"
      },
      {
        "id": "ward_25498",
        "label": "Xã Thạnh Bình"
      },
      {
        "id": "ward_25657",
        "label": "Xã Thạnh Đức"
      },
      {
        "id": "ward_27865",
        "label": "Xã Thạnh Hóa"
      },
      {
        "id": "ward_27994",
        "label": "Xã Thạnh Lợi"
      },
      {
        "id": "ward_27877",
        "label": "Xã Thạnh Phước"
      },
      {
        "id": "ward_28036",
        "label": "Xã Thủ Thừa"
      },
      {
        "id": "ward_28225",
        "label": "Xã Thuận Mỹ"
      },
      {
        "id": "ward_25510",
        "label": "Xã Trà Vong"
      },
      {
        "id": "ward_25666",
        "label": "Xã Truông Mít"
      },
      {
        "id": "ward_27775",
        "label": "Xã Tuyên Bình"
      },
      {
        "id": "ward_27817",
        "label": "Xã Tuyên Thạnh"
      },
      {
        "id": "ward_28093",
        "label": "Xã Vàm Cỏ"
      },
      {
        "id": "ward_27748",
        "label": "Xã Vĩnh Châu"
      },
      {
        "id": "ward_28222",
        "label": "Xã Vĩnh Công"
      },
      {
        "id": "ward_27757",
        "label": "Xã Vĩnh Hưng"
      },
      {
        "id": "ward_27736",
        "label": "Xã Vĩnh Thạnh"
      }
    ]
  },
  {
    "id": "thai_nguyen",
    "label": "Thái Nguyên",
    "wards": [
      {
        "id": "ward_05533",
        "label": "Phường Bá Xuyên"
      },
      {
        "id": "ward_05528",
        "label": "Phường Bách Quang"
      },
      {
        "id": "ward_01843",
        "label": "Phường Bắc Kạn"
      },
      {
        "id": "ward_01840",
        "label": "Phường Đức Xuân"
      },
      {
        "id": "ward_05467",
        "label": "Phường Gia Sàng"
      },
      {
        "id": "ward_05710",
        "label": "Phường Linh Sơn"
      },
      {
        "id": "ward_05443",
        "label": "Phường Phan Đình Phùng"
      },
      {
        "id": "ward_05860",
        "label": "Phường Phổ Yên"
      },
      {
        "id": "ward_05857",
        "label": "Phường Phúc Thuận"
      },
      {
        "id": "ward_05482",
        "label": "Phường Quan Triều"
      },
      {
        "id": "ward_05455",
        "label": "Phường Quyết Thắng"
      },
      {
        "id": "ward_05518",
        "label": "Phường Sông Công"
      },
      {
        "id": "ward_05500",
        "label": "Phường Tích Lương"
      },
      {
        "id": "ward_05899",
        "label": "Phường Trung Thành"
      },
      {
        "id": "ward_05890",
        "label": "Phường Vạn Xuân"
      },
      {
        "id": "ward_05809",
        "label": "Xã An Khánh"
      },
      {
        "id": "ward_01906",
        "label": "Xã Ba Bể"
      },
      {
        "id": "ward_02014",
        "label": "Xã Bạch Thông"
      },
      {
        "id": "ward_01864",
        "label": "Xã Bằng Thành"
      },
      {
        "id": "ward_01942",
        "label": "Xã Bằng Vân"
      },
      {
        "id": "ward_05605",
        "label": "Xã Bình Thành"
      },
      {
        "id": "ward_05587",
        "label": "Xã Bình Yên"
      },
      {
        "id": "ward_01879",
        "label": "Xã Cao Minh"
      },
      {
        "id": "ward_02008",
        "label": "Xã Cẩm Giàng"
      },
      {
        "id": "ward_02020",
        "label": "Xã Chợ Đồn"
      },
      {
        "id": "ward_02086",
        "label": "Xã Chợ Mới"
      },
      {
        "id": "ward_01912",
        "label": "Xã Chợ Rã"
      },
      {
        "id": "ward_02185",
        "label": "Xã Côn Minh"
      },
      {
        "id": "ward_02152",
        "label": "Xã Cường Lợi"
      },
      {
        "id": "ward_05755",
        "label": "Xã Dân Tiến"
      },
      {
        "id": "ward_05488",
        "label": "Xã Đại Phúc"
      },
      {
        "id": "ward_05830",
        "label": "Xã Đại Từ"
      },
      {
        "id": "ward_05941",
        "label": "Xã Điềm Thụy"
      },
      {
        "id": "ward_05569",
        "label": "Xã Định Hóa"
      },
      {
        "id": "ward_05692",
        "label": "Xã Đồng Hỷ"
      },
      {
        "id": "ward_01933",
        "label": "Xã Đồng Phúc"
      },
      {
        "id": "ward_05776",
        "label": "Xã Đức Lương"
      },
      {
        "id": "ward_01960",
        "label": "Xã Hiệp Lực"
      },
      {
        "id": "ward_05632",
        "label": "Xã Hợp Thành"
      },
      {
        "id": "ward_05953",
        "label": "Xã Kha Sơn"
      },
      {
        "id": "ward_05551",
        "label": "Xã Kim Phượng"
      },
      {
        "id": "ward_05818",
        "label": "Xã La Bằng"
      },
      {
        "id": "ward_05740",
        "label": "Xã La Hiên"
      },
      {
        "id": "ward_05542",
        "label": "Xã Lam Vỹ"
      },
      {
        "id": "ward_01936",
        "label": "Xã Nà Phặc"
      },
      {
        "id": "ward_02155",
        "label": "Xã Na Rì"
      },
      {
        "id": "ward_02026",
        "label": "Xã Nam Cường"
      },
      {
        "id": "ward_05707",
        "label": "Xã Nam Hòa"
      },
      {
        "id": "ward_01954",
        "label": "Xã Ngân Sơn"
      },
      {
        "id": "ward_02071",
        "label": "Xã Nghĩa Tá"
      },
      {
        "id": "ward_01882",
        "label": "Xã Nghiên Loan"
      },
      {
        "id": "ward_05722",
        "label": "Xã Nghinh Tường"
      },
      {
        "id": "ward_01849",
        "label": "Xã Phong Quang"
      },
      {
        "id": "ward_05908",
        "label": "Xã Phú Bình"
      },
      {
        "id": "ward_05602",
        "label": "Xã Phú Đình"
      },
      {
        "id": "ward_05788",
        "label": "Xã Phú Lạc"
      },
      {
        "id": "ward_05611",
        "label": "Xã Phú Lương"
      },
      {
        "id": "ward_05800",
        "label": "Xã Phú Thịnh"
      },
      {
        "id": "ward_01969",
        "label": "Xã Phủ Thông"
      },
      {
        "id": "ward_05773",
        "label": "Xã Phú Xuyên"
      },
      {
        "id": "ward_01894",
        "label": "Xã Phúc Lộc"
      },
      {
        "id": "ward_05563",
        "label": "Xã Phượng Tiến"
      },
      {
        "id": "ward_02038",
        "label": "Xã Quảng Bạch"
      },
      {
        "id": "ward_05674",
        "label": "Xã Quang Sơn"
      },
      {
        "id": "ward_05851",
        "label": "Xã Quân Chu"
      },
      {
        "id": "ward_05719",
        "label": "Xã Sảng Mộc"
      },
      {
        "id": "ward_05503",
        "label": "Xã Tân Cương"
      },
      {
        "id": "ward_05917",
        "label": "Xã Tân Khánh"
      },
      {
        "id": "ward_02104",
        "label": "Xã Tân Kỳ"
      },
      {
        "id": "ward_05923",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_05881",
        "label": "Xã Thành Công"
      },
      {
        "id": "ward_02101",
        "label": "Xã Thanh Mai"
      },
      {
        "id": "ward_02107",
        "label": "Xã Thanh Thịnh"
      },
      {
        "id": "ward_05725",
        "label": "Xã Thần Sa"
      },
      {
        "id": "ward_01921",
        "label": "Xã Thượng Minh"
      },
      {
        "id": "ward_01957",
        "label": "Xã Thượng Quan"
      },
      {
        "id": "ward_05662",
        "label": "Xã Trại Cau"
      },
      {
        "id": "ward_05746",
        "label": "Xã Tràng Xá"
      },
      {
        "id": "ward_02176",
        "label": "Xã Trần Phú"
      },
      {
        "id": "ward_05581",
        "label": "Xã Trung Hội"
      },
      {
        "id": "ward_05845",
        "label": "Xã Vạn Phú"
      },
      {
        "id": "ward_05680",
        "label": "Xã Văn Hán"
      },
      {
        "id": "ward_02143",
        "label": "Xã Văn Lang"
      },
      {
        "id": "ward_05665",
        "label": "Xã Văn Lăng"
      },
      {
        "id": "ward_01981",
        "label": "Xã Vĩnh Thông"
      },
      {
        "id": "ward_05716",
        "label": "Xã Võ Nhai"
      },
      {
        "id": "ward_05641",
        "label": "Xã Vô Tranh"
      },
      {
        "id": "ward_02191",
        "label": "Xã Xuân Dương"
      },
      {
        "id": "ward_02116",
        "label": "Xã Yên Bình"
      },
      {
        "id": "ward_02083",
        "label": "Xã Yên Phong"
      },
      {
        "id": "ward_02044",
        "label": "Xã Yên Thịnh"
      },
      {
        "id": "ward_05620",
        "label": "Xã Yên Trạch"
      }
    ]
  },
  {
    "id": "thanh_hoa",
    "label": "Thanh Hóa",
    "wards": [
      {
        "id": "ward_14812",
        "label": "Phường Bỉm Sơn"
      },
      {
        "id": "ward_16609",
        "label": "Phường Đào Duy Từ"
      },
      {
        "id": "ward_16417",
        "label": "Phường Đông Quang"
      },
      {
        "id": "ward_16378",
        "label": "Phường Đông Sơn"
      },
      {
        "id": "ward_15853",
        "label": "Phường Đông Tiến"
      },
      {
        "id": "ward_14797",
        "label": "Phường Hạc Thành"
      },
      {
        "id": "ward_16645",
        "label": "Phường Hải Bình"
      },
      {
        "id": "ward_16597",
        "label": "Phường Hải Lĩnh"
      },
      {
        "id": "ward_14758",
        "label": "Phường Hàm Rồng"
      },
      {
        "id": "ward_16516",
        "label": "Phường Nam Sầm Sơn"
      },
      {
        "id": "ward_16654",
        "label": "Phường Nghi Sơn"
      },
      {
        "id": "ward_16576",
        "label": "Phường Ngọc Sơn"
      },
      {
        "id": "ward_15925",
        "label": "Phường Nguyệt Viên"
      },
      {
        "id": "ward_16522",
        "label": "Phường Quảng Phú"
      },
      {
        "id": "ward_14818",
        "label": "Phường Quang Trung"
      },
      {
        "id": "ward_16531",
        "label": "Phường Sầm Sơn"
      },
      {
        "id": "ward_16594",
        "label": "Phường Tân Dân"
      },
      {
        "id": "ward_16561",
        "label": "Phường Tĩnh Gia"
      },
      {
        "id": "ward_16624",
        "label": "Phường Trúc Lâm"
      },
      {
        "id": "ward_15766",
        "label": "Xã An Nông"
      },
      {
        "id": "ward_16171",
        "label": "Xã Ba Đình"
      },
      {
        "id": "ward_14923",
        "label": "Xã Bá Thước"
      },
      {
        "id": "ward_15607",
        "label": "Xã Bát Mọt"
      },
      {
        "id": "ward_15382",
        "label": "Xã Biện Thượng"
      },
      {
        "id": "ward_16591",
        "label": "Xã Các Sơn"
      },
      {
        "id": "ward_15178",
        "label": "Xã Cẩm Tân"
      },
      {
        "id": "ward_15142",
        "label": "Xã Cẩm Thạch"
      },
      {
        "id": "ward_15127",
        "label": "Xã Cẩm Thủy"
      },
      {
        "id": "ward_15148",
        "label": "Xã Cẩm Tú"
      },
      {
        "id": "ward_15163",
        "label": "Xã Cẩm Vân"
      },
      {
        "id": "ward_14959",
        "label": "Xã Cổ Lũng"
      },
      {
        "id": "ward_16369",
        "label": "Xã Công Chính"
      },
      {
        "id": "ward_14950",
        "label": "Xã Điền Lư"
      },
      {
        "id": "ward_14932",
        "label": "Xã Điền Quang"
      },
      {
        "id": "ward_15448",
        "label": "Xã Định Hòa"
      },
      {
        "id": "ward_15457",
        "label": "Xã Định Tân"
      },
      {
        "id": "ward_15058",
        "label": "Xã Đồng Lương"
      },
      {
        "id": "ward_16033",
        "label": "Xã Đông Thành"
      },
      {
        "id": "ward_15724",
        "label": "Xã Đồng Tiến"
      },
      {
        "id": "ward_15043",
        "label": "Xã Giao An"
      },
      {
        "id": "ward_15274",
        "label": "Xã Hà Long"
      },
      {
        "id": "ward_15271",
        "label": "Xã Hà Trung"
      },
      {
        "id": "ward_16012",
        "label": "Xã Hậu Lộc"
      },
      {
        "id": "ward_14896",
        "label": "Xã Hiền Kiệt"
      },
      {
        "id": "ward_16072",
        "label": "Xã Hoa Lộc"
      },
      {
        "id": "ward_16186",
        "label": "Xã Hóa Quỳ"
      },
      {
        "id": "ward_15286",
        "label": "Xã Hoạt Giang"
      },
      {
        "id": "ward_15976",
        "label": "Xã Hoằng Châu"
      },
      {
        "id": "ward_15880",
        "label": "Xã Hoằng Giang"
      },
      {
        "id": "ward_15865",
        "label": "Xã Hoằng Hóa"
      },
      {
        "id": "ward_15961",
        "label": "Xã Hoằng Lộc"
      },
      {
        "id": "ward_15889",
        "label": "Xã Hoằng Phú"
      },
      {
        "id": "ward_15910",
        "label": "Xã Hoằng Sơn"
      },
      {
        "id": "ward_16000",
        "label": "Xã Hoằng Thanh"
      },
      {
        "id": "ward_15991",
        "label": "Xã Hoằng Tiến"
      },
      {
        "id": "ward_16138",
        "label": "Xã Hồ Vương"
      },
      {
        "id": "ward_14869",
        "label": "Xã Hồi Xuân"
      },
      {
        "id": "ward_15682",
        "label": "Xã Hợp Tiến"
      },
      {
        "id": "ward_15112",
        "label": "Xã Kiên Thọ"
      },
      {
        "id": "ward_15187",
        "label": "Xã Kim Tân"
      },
      {
        "id": "ward_15544",
        "label": "Xã Lam Sơn"
      },
      {
        "id": "ward_15055",
        "label": "Xã Linh Sơn"
      },
      {
        "id": "ward_15298",
        "label": "Xã Lĩnh Toại"
      },
      {
        "id": "ward_15634",
        "label": "Xã Luận Thành"
      },
      {
        "id": "ward_15628",
        "label": "Xã Lương Sơn"
      },
      {
        "id": "ward_16438",
        "label": "Xã Lưu Vệ"
      },
      {
        "id": "ward_16249",
        "label": "Xã Mậu Lâm"
      },
      {
        "id": "ward_15124",
        "label": "Xã Minh Sơn"
      },
      {
        "id": "ward_14866",
        "label": "Xã Mường Chanh"
      },
      {
        "id": "ward_14845",
        "label": "Xã Mường Lát"
      },
      {
        "id": "ward_14854",
        "label": "Xã Mường Lý"
      },
      {
        "id": "ward_15025",
        "label": "Xã Mường Mìn"
      },
      {
        "id": "ward_15013",
        "label": "Xã Na Mèo"
      },
      {
        "id": "ward_14902",
        "label": "Xã Nam Xuân"
      },
      {
        "id": "ward_16144",
        "label": "Xã Nga An"
      },
      {
        "id": "ward_16093",
        "label": "Xã Nga Sơn"
      },
      {
        "id": "ward_16114",
        "label": "Xã Nga Thắng"
      },
      {
        "id": "ward_15061",
        "label": "Xã Ngọc Lặc"
      },
      {
        "id": "ward_15091",
        "label": "Xã Ngọc Liên"
      },
      {
        "id": "ward_15250",
        "label": "Xã Ngọc Trạo"
      },
      {
        "id": "ward_15106",
        "label": "Xã Nguyệt Ấn"
      },
      {
        "id": "ward_14864",
        "label": "Xã Nhi Sơn"
      },
      {
        "id": "ward_16228",
        "label": "Xã Như Thanh"
      },
      {
        "id": "ward_16174",
        "label": "Xã Như Xuân"
      },
      {
        "id": "ward_16279",
        "label": "Xã Nông Cống"
      },
      {
        "id": "ward_14878",
        "label": "Xã Phú Lệ"
      },
      {
        "id": "ward_14890",
        "label": "Xã Phú Xuân"
      },
      {
        "id": "ward_14956",
        "label": "Xã Pù Luông"
      },
      {
        "id": "ward_14863",
        "label": "Xã Pù Nhi"
      },
      {
        "id": "ward_15016",
        "label": "Xã Quan Sơn"
      },
      {
        "id": "ward_16543",
        "label": "Xã Quảng Bình"
      },
      {
        "id": "ward_14860",
        "label": "Xã Quang Chiểu"
      },
      {
        "id": "ward_16489",
        "label": "Xã Quảng Chính"
      },
      {
        "id": "ward_16498",
        "label": "Xã Quảng Ngọc"
      },
      {
        "id": "ward_16540",
        "label": "Xã Quảng Ninh"
      },
      {
        "id": "ward_16480",
        "label": "Xã Quảng Yên"
      },
      {
        "id": "ward_15412",
        "label": "Xã Quý Lộc"
      },
      {
        "id": "ward_14953",
        "label": "Xã Quý Lương"
      },
      {
        "id": "ward_15553",
        "label": "Xã Sao Vàng"
      },
      {
        "id": "ward_15022",
        "label": "Xã Sơn Điện"
      },
      {
        "id": "ward_15010",
        "label": "Xã Sơn Thủy"
      },
      {
        "id": "ward_14848",
        "label": "Xã Tam Chung"
      },
      {
        "id": "ward_15019",
        "label": "Xã Tam Lư"
      },
      {
        "id": "ward_15007",
        "label": "Xã Tam Thanh"
      },
      {
        "id": "ward_15715",
        "label": "Xã Tân Ninh"
      },
      {
        "id": "ward_15661",
        "label": "Xã Tân Thành"
      },
      {
        "id": "ward_16108",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_15361",
        "label": "Xã Tây Đô"
      },
      {
        "id": "ward_15211",
        "label": "Xã Thạch Bình"
      },
      {
        "id": "ward_15085",
        "label": "Xã Thạch Lập"
      },
      {
        "id": "ward_15199",
        "label": "Xã Thạch Quảng"
      },
      {
        "id": "ward_16273",
        "label": "Xã Thanh Kỳ"
      },
      {
        "id": "ward_16213",
        "label": "Xã Thanh Phong"
      },
      {
        "id": "ward_16222",
        "label": "Xã Thanh Quân"
      },
      {
        "id": "ward_15229",
        "label": "Xã Thành Vinh"
      },
      {
        "id": "ward_16342",
        "label": "Xã Thăng Bình"
      },
      {
        "id": "ward_15643",
        "label": "Xã Thắng Lộc"
      },
      {
        "id": "ward_16309",
        "label": "Xã Thắng Lợi"
      },
      {
        "id": "ward_14908",
        "label": "Xã Thiên Phủ"
      },
      {
        "id": "ward_14980",
        "label": "Xã Thiết Ống"
      },
      {
        "id": "ward_15772",
        "label": "Xã Thiệu Hóa"
      },
      {
        "id": "ward_15796",
        "label": "Xã Thiệu Quang"
      },
      {
        "id": "ward_15778",
        "label": "Xã Thiệu Tiến"
      },
      {
        "id": "ward_15820",
        "label": "Xã Thiệu Toán"
      },
      {
        "id": "ward_15835",
        "label": "Xã Thiệu Trung"
      },
      {
        "id": "ward_15667",
        "label": "Xã Thọ Bình"
      },
      {
        "id": "ward_15568",
        "label": "Xã Thọ Lập"
      },
      {
        "id": "ward_15505",
        "label": "Xã Thọ Long"
      },
      {
        "id": "ward_15754",
        "label": "Xã Thọ Ngọc"
      },
      {
        "id": "ward_15763",
        "label": "Xã Thọ Phú"
      },
      {
        "id": "ward_15499",
        "label": "Xã Thọ Xuân"
      },
      {
        "id": "ward_16225",
        "label": "Xã Thượng Ninh"
      },
      {
        "id": "ward_15646",
        "label": "Xã Thường Xuân"
      },
      {
        "id": "ward_16549",
        "label": "Xã Tiên Trang"
      },
      {
        "id": "ward_15316",
        "label": "Xã Tống Sơn"
      },
      {
        "id": "ward_16021",
        "label": "Xã Triệu Lộc"
      },
      {
        "id": "ward_15664",
        "label": "Xã Triệu Sơn"
      },
      {
        "id": "ward_16297",
        "label": "Xã Trung Chính"
      },
      {
        "id": "ward_15001",
        "label": "Xã Trung Hạ"
      },
      {
        "id": "ward_14857",
        "label": "Xã Trung Lý"
      },
      {
        "id": "ward_14875",
        "label": "Xã Trung Sơn"
      },
      {
        "id": "ward_14872",
        "label": "Xã Trung Thành"
      },
      {
        "id": "ward_16636",
        "label": "Xã Trường Lâm"
      },
      {
        "id": "ward_16348",
        "label": "Xã Trường Văn"
      },
      {
        "id": "ward_16363",
        "label": "Xã Tượng Lĩnh"
      },
      {
        "id": "ward_16078",
        "label": "Xã Vạn Lộc"
      },
      {
        "id": "ward_15622",
        "label": "Xã Vạn Xuân"
      },
      {
        "id": "ward_14974",
        "label": "Xã Văn Nho"
      },
      {
        "id": "ward_15049",
        "label": "Xã Văn Phú"
      },
      {
        "id": "ward_15190",
        "label": "Xã Vân Du"
      },
      {
        "id": "ward_15349",
        "label": "Xã Vĩnh Lộc"
      },
      {
        "id": "ward_16177",
        "label": "Xã Xuân Bình"
      },
      {
        "id": "ward_15658",
        "label": "Xã Xuân Chinh"
      },
      {
        "id": "ward_16234",
        "label": "Xã Xuân Du"
      },
      {
        "id": "ward_15520",
        "label": "Xã Xuân Hòa"
      },
      {
        "id": "ward_15592",
        "label": "Xã Xuân Lập"
      },
      {
        "id": "ward_16258",
        "label": "Xã Xuân Thái"
      },
      {
        "id": "ward_15574",
        "label": "Xã Xuân Tín"
      },
      {
        "id": "ward_15469",
        "label": "Xã Yên Định"
      },
      {
        "id": "ward_15031",
        "label": "Xã Yên Khương"
      },
      {
        "id": "ward_15610",
        "label": "Xã Yên Nhân"
      },
      {
        "id": "ward_15442",
        "label": "Xã Yên Ninh"
      },
      {
        "id": "ward_15409",
        "label": "Xã Yên Phú"
      },
      {
        "id": "ward_15034",
        "label": "Xã Yên Thắng"
      },
      {
        "id": "ward_16264",
        "label": "Xã Yên Thọ"
      },
      {
        "id": "ward_15421",
        "label": "Xã Yên Trường"
      }
    ]
  },
  {
    "id": "tp_ho_chi_minh",
    "label": "TP. Hồ Chí Minh",
    "wards": [
      {
        "id": "ward_26732",
        "label": "Đặc khu Côn Đảo"
      },
      {
        "id": "ward_27316",
        "label": "Phường An Đông"
      },
      {
        "id": "ward_26878",
        "label": "Phường An Hội Đông"
      },
      {
        "id": "ward_26882",
        "label": "Phường An Hội Tây"
      },
      {
        "id": "ward_27094",
        "label": "Phường An Khánh"
      },
      {
        "id": "ward_27460",
        "label": "Phường An Lạc"
      },
      {
        "id": "ward_26876",
        "label": "Phường An Nhơn"
      },
      {
        "id": "ward_25975",
        "label": "Phường An Phú"
      },
      {
        "id": "ward_26767",
        "label": "Phường An Phú Đông"
      },
      {
        "id": "ward_26560",
        "label": "Phường Bà Rịa"
      },
      {
        "id": "ward_27154",
        "label": "Phường Bàn Cờ"
      },
      {
        "id": "ward_26983",
        "label": "Phường Bảy Hiền"
      },
      {
        "id": "ward_25813",
        "label": "Phường Bến Cát"
      },
      {
        "id": "ward_26743",
        "label": "Phường Bến Thành"
      },
      {
        "id": "ward_25915",
        "label": "Phường Bình Cơ"
      },
      {
        "id": "ward_25760",
        "label": "Phường Bình Dương"
      },
      {
        "id": "ward_27424",
        "label": "Phường Bình Đông"
      },
      {
        "id": "ward_25987",
        "label": "Phường Bình Hòa"
      },
      {
        "id": "ward_27439",
        "label": "Phường Bình Hưng Hòa"
      },
      {
        "id": "ward_26905",
        "label": "Phường Bình Lợi Trung"
      },
      {
        "id": "ward_27364",
        "label": "Phường Bình Phú"
      },
      {
        "id": "ward_26911",
        "label": "Phường Bình Quới"
      },
      {
        "id": "ward_27442",
        "label": "Phường Bình Tân"
      },
      {
        "id": "ward_27367",
        "label": "Phường Bình Tây"
      },
      {
        "id": "ward_26929",
        "label": "Phường Bình Thạnh"
      },
      {
        "id": "ward_27232",
        "label": "Phường Bình Thới"
      },
      {
        "id": "ward_27373",
        "label": "Phường Bình Tiên"
      },
      {
        "id": "ward_27448",
        "label": "Phường Bình Trị Đông"
      },
      {
        "id": "ward_27097",
        "label": "Phường Bình Trưng"
      },
      {
        "id": "ward_27112",
        "label": "Phường Cát Lái"
      },
      {
        "id": "ward_27058",
        "label": "Phường Cầu Kiệu"
      },
      {
        "id": "ward_26758",
        "label": "Phường Cầu Ông Lãnh"
      },
      {
        "id": "ward_25771",
        "label": "Phường Chánh Hiệp"
      },
      {
        "id": "ward_27418",
        "label": "Phường Chánh Hưng"
      },
      {
        "id": "ward_25837",
        "label": "Phường Chánh Phú Hòa"
      },
      {
        "id": "ward_27343",
        "label": "Phường Chợ Lớn"
      },
      {
        "id": "ward_27301",
        "label": "Phường Chợ Quán"
      },
      {
        "id": "ward_25942",
        "label": "Phường Dĩ An"
      },
      {
        "id": "ward_27169",
        "label": "Phường Diên Hồng"
      },
      {
        "id": "ward_25951",
        "label": "Phường Đông Hòa"
      },
      {
        "id": "ward_26791",
        "label": "Phường Đông Hưng Thuận"
      },
      {
        "id": "ward_27043",
        "label": "Phường Đức Nhuận"
      },
      {
        "id": "ward_26944",
        "label": "Phường Gia Định"
      },
      {
        "id": "ward_26884",
        "label": "Phường Gò Vấp"
      },
      {
        "id": "ward_26890",
        "label": "Phường Hạnh Thông"
      },
      {
        "id": "ward_26809",
        "label": "Phường Hiệp Bình"
      },
      {
        "id": "ward_27211",
        "label": "Phường Hòa Bình"
      },
      {
        "id": "ward_27163",
        "label": "Phường Hòa Hưng"
      },
      {
        "id": "ward_25849",
        "label": "Phường Hòa Lợi"
      },
      {
        "id": "ward_27265",
        "label": "Phường Khánh Hội"
      },
      {
        "id": "ward_25966",
        "label": "Phường Lái Thiêu"
      },
      {
        "id": "ward_26800",
        "label": "Phường Linh Xuân"
      },
      {
        "id": "ward_26833",
        "label": "Phường Long Bình"
      },
      {
        "id": "ward_26566",
        "label": "Phường Long Hương"
      },
      {
        "id": "ward_25840",
        "label": "Phường Long Nguyên"
      },
      {
        "id": "ward_26857",
        "label": "Phường Long Phước"
      },
      {
        "id": "ward_26860",
        "label": "Phường Long Trường"
      },
      {
        "id": "ward_27238",
        "label": "Phường Minh Phụng"
      },
      {
        "id": "ward_27142",
        "label": "Phường Nhiêu Lộc"
      },
      {
        "id": "ward_25768",
        "label": "Phường Phú An"
      },
      {
        "id": "ward_27427",
        "label": "Phường Phú Định"
      },
      {
        "id": "ward_27349",
        "label": "Phường Phú Lâm"
      },
      {
        "id": "ward_25750",
        "label": "Phường Phú Lợi"
      },
      {
        "id": "ward_26704",
        "label": "Phường Phú Mỹ"
      },
      {
        "id": "ward_27073",
        "label": "Phường Phú Nhuận"
      },
      {
        "id": "ward_27028",
        "label": "Phường Phú Thạnh"
      },
      {
        "id": "ward_27226",
        "label": "Phường Phú Thọ"
      },
      {
        "id": "ward_27022",
        "label": "Phường Phú Thọ Hòa"
      },
      {
        "id": "ward_27484",
        "label": "Phường Phú Thuận"
      },
      {
        "id": "ward_26848",
        "label": "Phường Phước Long"
      },
      {
        "id": "ward_26542",
        "label": "Phường Phước Thắng"
      },
      {
        "id": "ward_26536",
        "label": "Phường Rạch Dừa"
      },
      {
        "id": "ward_26740",
        "label": "Phường Sài Gòn"
      },
      {
        "id": "ward_26803",
        "label": "Phường Tam Bình"
      },
      {
        "id": "ward_26572",
        "label": "Phường Tam Long"
      },
      {
        "id": "ward_26526",
        "label": "Phường Tam Thắng"
      },
      {
        "id": "ward_26842",
        "label": "Phường Tăng Nhơn Phú"
      },
      {
        "id": "ward_27004",
        "label": "Phường Tân Bình"
      },
      {
        "id": "ward_26737",
        "label": "Phường Tân Định"
      },
      {
        "id": "ward_25945",
        "label": "Phường Tân Đông Hiệp"
      },
      {
        "id": "ward_26710",
        "label": "Phường Tân Hải"
      },
      {
        "id": "ward_25920",
        "label": "Phường Tân Hiệp"
      },
      {
        "id": "ward_26995",
        "label": "Phường Tân Hòa"
      },
      {
        "id": "ward_27475",
        "label": "Phường Tân Hưng"
      },
      {
        "id": "ward_25891",
        "label": "Phường Tân Khánh"
      },
      {
        "id": "ward_27487",
        "label": "Phường Tân Mỹ"
      },
      {
        "id": "ward_27031",
        "label": "Phường Tân Phú"
      },
      {
        "id": "ward_26713",
        "label": "Phường Tân Phước"
      },
      {
        "id": "ward_27007",
        "label": "Phường Tân Sơn"
      },
      {
        "id": "ward_26977",
        "label": "Phường Tân Sơn Hòa"
      },
      {
        "id": "ward_26968",
        "label": "Phường Tân Sơn Nhất"
      },
      {
        "id": "ward_27019",
        "label": "Phường Tân Sơn Nhì"
      },
      {
        "id": "ward_27457",
        "label": "Phường Tân Tạo"
      },
      {
        "id": "ward_26725",
        "label": "Phường Tân Thành"
      },
      {
        "id": "ward_26782",
        "label": "Phường Tân Thới Hiệp"
      },
      {
        "id": "ward_27478",
        "label": "Phường Tân Thuận"
      },
      {
        "id": "ward_25888",
        "label": "Phường Tân Uyên"
      },
      {
        "id": "ward_25843",
        "label": "Phường Tây Nam"
      },
      {
        "id": "ward_27013",
        "label": "Phường Tây Thạnh"
      },
      {
        "id": "ward_26956",
        "label": "Phường Thạnh Mỹ Tây"
      },
      {
        "id": "ward_26898",
        "label": "Phường Thông Tây Hội"
      },
      {
        "id": "ward_26773",
        "label": "Phường Thới An"
      },
      {
        "id": "ward_25846",
        "label": "Phường Thới Hòa"
      },
      {
        "id": "ward_25747",
        "label": "Phường Thủ Dầu Một"
      },
      {
        "id": "ward_26824",
        "label": "Phường Thủ Đức"
      },
      {
        "id": "ward_25978",
        "label": "Phường Thuận An"
      },
      {
        "id": "ward_25969",
        "label": "Phường Thuận Giao"
      },
      {
        "id": "ward_26785",
        "label": "Phường Trung Mỹ Tây"
      },
      {
        "id": "ward_27286",
        "label": "Phường Vĩnh Hội"
      },
      {
        "id": "ward_25912",
        "label": "Phường Vĩnh Tân"
      },
      {
        "id": "ward_26506",
        "label": "Phường Vũng Tàu"
      },
      {
        "id": "ward_27190",
        "label": "Phường Vườn Lài"
      },
      {
        "id": "ward_27259",
        "label": "Phường Xóm Chiếu"
      },
      {
        "id": "ward_27139",
        "label": "Phường Xuân Hòa"
      },
      {
        "id": "ward_25867",
        "label": "Xã An Long"
      },
      {
        "id": "ward_27508",
        "label": "Xã An Nhơn Tây"
      },
      {
        "id": "ward_27673",
        "label": "Xã An Thới Đông"
      },
      {
        "id": "ward_27592",
        "label": "Xã Bà Điểm"
      },
      {
        "id": "ward_25822",
        "label": "Xã Bàu Bàng"
      },
      {
        "id": "ward_26638",
        "label": "Xã Bàu Lâm"
      },
      {
        "id": "ward_25906",
        "label": "Xã Bắc Tân Uyên"
      },
      {
        "id": "ward_27637",
        "label": "Xã Bình Chánh"
      },
      {
        "id": "ward_26656",
        "label": "Xã Bình Châu"
      },
      {
        "id": "ward_26590",
        "label": "Xã Bình Giã"
      },
      {
        "id": "ward_27619",
        "label": "Xã Bình Hưng"
      },
      {
        "id": "ward_27667",
        "label": "Xã Bình Khánh"
      },
      {
        "id": "ward_27610",
        "label": "Xã Bình Lợi"
      },
      {
        "id": "ward_27544",
        "label": "Xã Bình Mỹ"
      },
      {
        "id": "ward_27664",
        "label": "Xã Cần Giờ"
      },
      {
        "id": "ward_26596",
        "label": "Xã Châu Đức"
      },
      {
        "id": "ward_26728",
        "label": "Xã Châu Pha"
      },
      {
        "id": "ward_27553",
        "label": "Xã Củ Chi"
      },
      {
        "id": "ward_25777",
        "label": "Xã Dầu Tiếng"
      },
      {
        "id": "ward_26680",
        "label": "Xã Đất Đỏ"
      },
      {
        "id": "ward_27568",
        "label": "Xã Đông Thạnh"
      },
      {
        "id": "ward_27658",
        "label": "Xã Hiệp Phước"
      },
      {
        "id": "ward_26647",
        "label": "Xã Hòa Hiệp"
      },
      {
        "id": "ward_26641",
        "label": "Xã Hòa Hội"
      },
      {
        "id": "ward_27559",
        "label": "Xã Hóc Môn"
      },
      {
        "id": "ward_26620",
        "label": "Xã Hồ Tràm"
      },
      {
        "id": "ward_27628",
        "label": "Xã Hưng Long"
      },
      {
        "id": "ward_26608",
        "label": "Xã Kim Long"
      },
      {
        "id": "ward_26659",
        "label": "Xã Long Điền"
      },
      {
        "id": "ward_26662",
        "label": "Xã Long Hải"
      },
      {
        "id": "ward_25792",
        "label": "Xã Long Hòa"
      },
      {
        "id": "ward_26545",
        "label": "Xã Long Sơn"
      },
      {
        "id": "ward_25780",
        "label": "Xã Minh Thạnh"
      },
      {
        "id": "ward_26575",
        "label": "Xã Ngãi Giao"
      },
      {
        "id": "ward_26617",
        "label": "Xã Nghĩa Thành"
      },
      {
        "id": "ward_27655",
        "label": "Xã Nhà Bè"
      },
      {
        "id": "ward_27511",
        "label": "Xã Nhuận Đức"
      },
      {
        "id": "ward_25858",
        "label": "Xã Phú Giáo"
      },
      {
        "id": "ward_27541",
        "label": "Xã Phú Hòa Đông"
      },
      {
        "id": "ward_26686",
        "label": "Xã Phước Hải"
      },
      {
        "id": "ward_25882",
        "label": "Xã Phước Hòa"
      },
      {
        "id": "ward_25864",
        "label": "Xã Phước Thành"
      },
      {
        "id": "ward_27496",
        "label": "Xã Tân An Hội"
      },
      {
        "id": "ward_27595",
        "label": "Xã Tân Nhựt"
      },
      {
        "id": "ward_27604",
        "label": "Xã Tân Vĩnh Lộc"
      },
      {
        "id": "ward_27526",
        "label": "Xã Thái Mỹ"
      },
      {
        "id": "ward_25807",
        "label": "Xã Thanh An"
      },
      {
        "id": "ward_27676",
        "label": "Xã Thạnh An"
      },
      {
        "id": "ward_25909",
        "label": "Xã Thường Tân"
      },
      {
        "id": "ward_25819",
        "label": "Xã Trừ Văn Thố"
      },
      {
        "id": "ward_27601",
        "label": "Xã Vĩnh Lộc"
      },
      {
        "id": "ward_26584",
        "label": "Xã Xuân Sơn"
      },
      {
        "id": "ward_27577",
        "label": "Xã Xuân Thới Sơn"
      },
      {
        "id": "ward_26632",
        "label": "Xã Xuyên Mộc"
      }
    ]
  },
  {
    "id": "tuyen_quang",
    "label": "Tuyên Quang",
    "wards": [
      {
        "id": "ward_02512",
        "label": "Phường An Tường"
      },
      {
        "id": "ward_02524",
        "label": "Phường Bình Thuận"
      },
      {
        "id": "ward_00694",
        "label": "Phường Hà Giang 1"
      },
      {
        "id": "ward_00691",
        "label": "Phường Hà Giang 2"
      },
      {
        "id": "ward_02215",
        "label": "Phường Minh Xuân"
      },
      {
        "id": "ward_02509",
        "label": "Phường Mỹ Lâm"
      },
      {
        "id": "ward_02212",
        "label": "Phường Nông Tiến"
      },
      {
        "id": "ward_00832",
        "label": "Xã Bạch Đích"
      },
      {
        "id": "ward_00976",
        "label": "Xã Bạch Ngọc"
      },
      {
        "id": "ward_02380",
        "label": "Xã Bạch Xa"
      },
      {
        "id": "ward_01024",
        "label": "Xã Bản Máy"
      },
      {
        "id": "ward_00991",
        "label": "Xã Bắc Mê"
      },
      {
        "id": "ward_01153",
        "label": "Xã Bắc Quang"
      },
      {
        "id": "ward_01180",
        "label": "Xã Bằng Hành"
      },
      {
        "id": "ward_01246",
        "label": "Xã Bằng Lang"
      },
      {
        "id": "ward_02296",
        "label": "Xã Bình An"
      },
      {
        "id": "ward_02548",
        "label": "Xã Bình Ca"
      },
      {
        "id": "ward_02404",
        "label": "Xã Bình Xa"
      },
      {
        "id": "ward_00883",
        "label": "Xã Cán Tỷ"
      },
      {
        "id": "ward_00952",
        "label": "Xã Cao Bồ"
      },
      {
        "id": "ward_02287",
        "label": "Xã Chiêm Hóa"
      },
      {
        "id": "ward_02245",
        "label": "Xã Côn Lôn"
      },
      {
        "id": "ward_00871",
        "label": "Xã Du Già"
      },
      {
        "id": "ward_01165",
        "label": "Xã Đồng Tâm"
      },
      {
        "id": "ward_02572",
        "label": "Xã Đông Thọ"
      },
      {
        "id": "ward_00721",
        "label": "Xã Đồng Văn"
      },
      {
        "id": "ward_01216",
        "label": "Xã Đồng Yên"
      },
      {
        "id": "ward_01012",
        "label": "Xã Đường Hồng"
      },
      {
        "id": "ward_00865",
        "label": "Xã Đường Thượng"
      },
      {
        "id": "ward_00985",
        "label": "Xã Giáp Trung"
      },
      {
        "id": "ward_02374",
        "label": "Xã Hàm Yên"
      },
      {
        "id": "ward_02353",
        "label": "Xã Hòa An"
      },
      {
        "id": "ward_01021",
        "label": "Xã Hoàng Su Phì"
      },
      {
        "id": "ward_01084",
        "label": "Xã Hồ Thầu"
      },
      {
        "id": "ward_02608",
        "label": "Xã Hồng Sơn"
      },
      {
        "id": "ward_02260",
        "label": "Xã Hồng Thái"
      },
      {
        "id": "ward_01201",
        "label": "Xã Hùng An"
      },
      {
        "id": "ward_02425",
        "label": "Xã Hùng Đức"
      },
      {
        "id": "ward_02455",
        "label": "Xã Hùng Lợi"
      },
      {
        "id": "ward_00802",
        "label": "Xã Khâu Vai"
      },
      {
        "id": "ward_01147",
        "label": "Xã Khuôn Lùng"
      },
      {
        "id": "ward_02332",
        "label": "Xã Kiên Đài"
      },
      {
        "id": "ward_02437",
        "label": "Xã Kiến Thiết"
      },
      {
        "id": "ward_02350",
        "label": "Xã Kim Bình"
      },
      {
        "id": "ward_00937",
        "label": "Xã Lao Chải"
      },
      {
        "id": "ward_02266",
        "label": "Xã Lâm Bình"
      },
      {
        "id": "ward_01192",
        "label": "Xã Liên Hiệp"
      },
      {
        "id": "ward_00970",
        "label": "Xã Linh Hồ"
      },
      {
        "id": "ward_00715",
        "label": "Xã Lũng Cú"
      },
      {
        "id": "ward_00763",
        "label": "Xã Lũng Phìn"
      },
      {
        "id": "ward_00901",
        "label": "Xã Lùng Tám"
      },
      {
        "id": "ward_02434",
        "label": "Xã Lực Hành"
      },
      {
        "id": "ward_00847",
        "label": "Xã Mậu Duệ"
      },
      {
        "id": "ward_00769",
        "label": "Xã Mèo Vạc"
      },
      {
        "id": "ward_00994",
        "label": "Xã Minh Ngọc"
      },
      {
        "id": "ward_02302",
        "label": "Xã Minh Quang"
      },
      {
        "id": "ward_00982",
        "label": "Xã Minh Sơn"
      },
      {
        "id": "ward_00919",
        "label": "Xã Minh Tân"
      },
      {
        "id": "ward_02554",
        "label": "Xã Minh Thanh"
      },
      {
        "id": "ward_02221",
        "label": "Xã Nà Hang"
      },
      {
        "id": "ward_01141",
        "label": "Xã Nấm Dẩn"
      },
      {
        "id": "ward_01075",
        "label": "Xã Nậm Dịch"
      },
      {
        "id": "ward_00889",
        "label": "Xã Nghĩa Thuận"
      },
      {
        "id": "ward_00700",
        "label": "Xã Ngọc Đường"
      },
      {
        "id": "ward_00859",
        "label": "Xã Ngọc Long"
      },
      {
        "id": "ward_02530",
        "label": "Xã Nhữ Khê"
      },
      {
        "id": "ward_00817",
        "label": "Xã Niêm Sơn"
      },
      {
        "id": "ward_01096",
        "label": "Xã Pà Vầy Sủ"
      },
      {
        "id": "ward_00745",
        "label": "Xã Phố Bảng"
      },
      {
        "id": "ward_00706",
        "label": "Xã Phú Linh"
      },
      {
        "id": "ward_02611",
        "label": "Xã Phú Lương"
      },
      {
        "id": "ward_02392",
        "label": "Xã Phù Lưu"
      },
      {
        "id": "ward_01057",
        "label": "Xã Pờ Ly Ngài"
      },
      {
        "id": "ward_00874",
        "label": "Xã Quản Bạ"
      },
      {
        "id": "ward_01237",
        "label": "Xã Quang Bình"
      },
      {
        "id": "ward_01144",
        "label": "Xã Quảng Nguyên"
      },
      {
        "id": "ward_00733",
        "label": "Xã Sà Phìn"
      },
      {
        "id": "ward_02536",
        "label": "Xã Sơn Dương"
      },
      {
        "id": "ward_02620",
        "label": "Xã Sơn Thủy"
      },
      {
        "id": "ward_00778",
        "label": "Xã Sơn Vĩ"
      },
      {
        "id": "ward_00787",
        "label": "Xã Sủng Máng"
      },
      {
        "id": "ward_00808",
        "label": "Xã Tát Ngà"
      },
      {
        "id": "ward_02320",
        "label": "Xã Tân An"
      },
      {
        "id": "ward_02470",
        "label": "Xã Tân Long"
      },
      {
        "id": "ward_02308",
        "label": "Xã Tân Mỹ"
      },
      {
        "id": "ward_01171",
        "label": "Xã Tân Quang"
      },
      {
        "id": "ward_02578",
        "label": "Xã Tân Thanh"
      },
      {
        "id": "ward_01051",
        "label": "Xã Tân Tiến"
      },
      {
        "id": "ward_02545",
        "label": "Xã Tân Trào"
      },
      {
        "id": "ward_01243",
        "label": "Xã Tân Trịnh"
      },
      {
        "id": "ward_02494",
        "label": "Xã Thái Bình"
      },
      {
        "id": "ward_02419",
        "label": "Xã Thái Hòa"
      },
      {
        "id": "ward_02407",
        "label": "Xã Thái Sơn"
      },
      {
        "id": "ward_01033",
        "label": "Xã Thàng Tín"
      },
      {
        "id": "ward_00928",
        "label": "Xã Thanh Thủy"
      },
      {
        "id": "ward_00829",
        "label": "Xã Thắng Mố"
      },
      {
        "id": "ward_01090",
        "label": "Xã Thông Nguyên"
      },
      {
        "id": "ward_00922",
        "label": "Xã Thuận Hòa"
      },
      {
        "id": "ward_02269",
        "label": "Xã Thượng Lâm"
      },
      {
        "id": "ward_02239",
        "label": "Xã Thượng Nông"
      },
      {
        "id": "ward_00958",
        "label": "Xã Thượng Sơn"
      },
      {
        "id": "ward_01225",
        "label": "Xã Tiên Nguyên"
      },
      {
        "id": "ward_01261",
        "label": "Xã Tiên Yên"
      },
      {
        "id": "ward_02359",
        "label": "Xã Tri Phú"
      },
      {
        "id": "ward_02305",
        "label": "Xã Trung Hà"
      },
      {
        "id": "ward_02458",
        "label": "Xã Trung Sơn"
      },
      {
        "id": "ward_01117",
        "label": "Xã Trung Thịnh"
      },
      {
        "id": "ward_02623",
        "label": "Xã Trường Sinh"
      },
      {
        "id": "ward_00925",
        "label": "Xã Tùng Bá"
      },
      {
        "id": "ward_00892",
        "label": "Xã Tùng Vài"
      },
      {
        "id": "ward_00913",
        "label": "Xã Vị Xuyên"
      },
      {
        "id": "ward_00967",
        "label": "Xã Việt Lâm"
      },
      {
        "id": "ward_01156",
        "label": "Xã Vĩnh Tuy"
      },
      {
        "id": "ward_01108",
        "label": "Xã Xín Mần"
      },
      {
        "id": "ward_01255",
        "label": "Xã Xuân Giang"
      },
      {
        "id": "ward_02449",
        "label": "Xã Xuân Vân"
      },
      {
        "id": "ward_01006",
        "label": "Xã Yên Cường"
      },
      {
        "id": "ward_02248",
        "label": "Xã Yên Hoa"
      },
      {
        "id": "ward_02317",
        "label": "Xã Yên Lập"
      },
      {
        "id": "ward_00820",
        "label": "Xã Yên Minh"
      },
      {
        "id": "ward_02365",
        "label": "Xã Yên Nguyên"
      },
      {
        "id": "ward_02398",
        "label": "Xã Yên Phú"
      },
      {
        "id": "ward_02473",
        "label": "Xã Yên Sơn"
      },
      {
        "id": "ward_01234",
        "label": "Xã Yên Thành"
      }
    ]
  },
  {
    "id": "vinh_long",
    "label": "Vĩnh Long",
    "wards": [
      {
        "id": "ward_28777",
        "label": "Phường An Hội"
      },
      {
        "id": "ward_28789",
        "label": "Phường Bến Tre"
      },
      {
        "id": "ward_29771",
        "label": "Phường Bình Minh"
      },
      {
        "id": "ward_29770",
        "label": "Phường Cái Vồn"
      },
      {
        "id": "ward_29512",
        "label": "Phường Duyên Hải"
      },
      {
        "id": "ward_29812",
        "label": "Phường Đông Thành"
      },
      {
        "id": "ward_29398",
        "label": "Phường Hòa Thuận"
      },
      {
        "id": "ward_29551",
        "label": "Phường Long Châu"
      },
      {
        "id": "ward_29263",
        "label": "Phường Long Đức"
      },
      {
        "id": "ward_29254",
        "label": "Phường Nguyệt Hóa"
      },
      {
        "id": "ward_28756",
        "label": "Phường Phú Khương"
      },
      {
        "id": "ward_28858",
        "label": "Phường Phú Tân"
      },
      {
        "id": "ward_29557",
        "label": "Phường Phước Hậu"
      },
      {
        "id": "ward_28783",
        "label": "Phường Sơn Đông"
      },
      {
        "id": "ward_29593",
        "label": "Phường Tân Hạnh"
      },
      {
        "id": "ward_29566",
        "label": "Phường Tân Ngãi"
      },
      {
        "id": "ward_29590",
        "label": "Phường Thanh Đức"
      },
      {
        "id": "ward_29242",
        "label": "Phường Trà Vinh"
      },
      {
        "id": "ward_29516",
        "label": "Phường Trường Long Hòa"
      },
      {
        "id": "ward_29584",
        "label": "Xã An Bình"
      },
      {
        "id": "ward_28957",
        "label": "Xã An Định"
      },
      {
        "id": "ward_29158",
        "label": "Xã An Hiệp"
      },
      {
        "id": "ward_29143",
        "label": "Xã An Ngãi Trung"
      },
      {
        "id": "ward_29317",
        "label": "Xã An Phú Tân"
      },
      {
        "id": "ward_29224",
        "label": "Xã An Qui"
      },
      {
        "id": "ward_29275",
        "label": "Xã An Trường"
      },
      {
        "id": "ward_29110",
        "label": "Xã Ba Tri"
      },
      {
        "id": "ward_29125",
        "label": "Xã Bảo Thạnh"
      },
      {
        "id": "ward_29050",
        "label": "Xã Bình Đại"
      },
      {
        "id": "ward_29287",
        "label": "Xã Bình Phú"
      },
      {
        "id": "ward_29638",
        "label": "Xã Bình Phước"
      },
      {
        "id": "ward_29728",
        "label": "Xã Cái Ngang"
      },
      {
        "id": "ward_29641",
        "label": "Xã Cái Nhum"
      },
      {
        "id": "ward_29266",
        "label": "Xã Càng Long"
      },
      {
        "id": "ward_29308",
        "label": "Xã Cầu Kè"
      },
      {
        "id": "ward_29416",
        "label": "Xã Cầu Ngang"
      },
      {
        "id": "ward_28996",
        "label": "Xã Châu Hòa"
      },
      {
        "id": "ward_29083",
        "label": "Xã Châu Hưng"
      },
      {
        "id": "ward_29374",
        "label": "Xã Châu Thành"
      },
      {
        "id": "ward_28870",
        "label": "Xã Chợ Lách"
      },
      {
        "id": "ward_29491",
        "label": "Xã Đại An"
      },
      {
        "id": "ward_29194",
        "label": "Xã Đại Điền"
      },
      {
        "id": "ward_29497",
        "label": "Xã Đôn Châu"
      },
      {
        "id": "ward_29536",
        "label": "Xã Đông Hải"
      },
      {
        "id": "ward_28945",
        "label": "Xã Đồng Khởi"
      },
      {
        "id": "ward_28807",
        "label": "Xã Giao Long"
      },
      {
        "id": "ward_28984",
        "label": "Xã Giồng Trôm"
      },
      {
        "id": "ward_29489",
        "label": "Xã Hàm Giang"
      },
      {
        "id": "ward_29455",
        "label": "Xã Hiệp Mỹ"
      },
      {
        "id": "ward_29701",
        "label": "Xã Hiếu Phụng"
      },
      {
        "id": "ward_29713",
        "label": "Xã Hiếu Thành"
      },
      {
        "id": "ward_29830",
        "label": "Xã Hòa Bình"
      },
      {
        "id": "ward_29734",
        "label": "Xã Hòa Hiệp"
      },
      {
        "id": "ward_29410",
        "label": "Xã Hòa Minh"
      },
      {
        "id": "ward_29362",
        "label": "Xã Hùng Hòa"
      },
      {
        "id": "ward_28901",
        "label": "Xã Hưng Khánh Trung"
      },
      {
        "id": "ward_29407",
        "label": "Xã Hưng Mỹ"
      },
      {
        "id": "ward_29044",
        "label": "Xã Hưng Nhượng"
      },
      {
        "id": "ward_28981",
        "label": "Xã Hương Mỹ"
      },
      {
        "id": "ward_29506",
        "label": "Xã Long Hiệp"
      },
      {
        "id": "ward_29413",
        "label": "Xã Long Hòa"
      },
      {
        "id": "ward_29602",
        "label": "Xã Long Hồ"
      },
      {
        "id": "ward_29518",
        "label": "Xã Long Hữu"
      },
      {
        "id": "ward_29513",
        "label": "Xã Long Thành"
      },
      {
        "id": "ward_29533",
        "label": "Xã Long Vĩnh"
      },
      {
        "id": "ward_29077",
        "label": "Xã Lộc Thuận"
      },
      {
        "id": "ward_29857",
        "label": "Xã Lục Sĩ Thành"
      },
      {
        "id": "ward_28987",
        "label": "Xã Lương Hòa"
      },
      {
        "id": "ward_28993",
        "label": "Xã Lương Phú"
      },
      {
        "id": "ward_29476",
        "label": "Xã Lưu Nghiệp Anh"
      },
      {
        "id": "ward_28903",
        "label": "Xã Mỏ Cày"
      },
      {
        "id": "ward_29122",
        "label": "Xã Mỹ Chánh Hòa"
      },
      {
        "id": "ward_29419",
        "label": "Xã Mỹ Long"
      },
      {
        "id": "ward_29788",
        "label": "Xã Mỹ Thuận"
      },
      {
        "id": "ward_29767",
        "label": "Xã Ngãi Tứ"
      },
      {
        "id": "ward_29530",
        "label": "Xã Ngũ Lạc"
      },
      {
        "id": "ward_29302",
        "label": "Xã Nhị Long"
      },
      {
        "id": "ward_29446",
        "label": "Xã Nhị Trường"
      },
      {
        "id": "ward_29623",
        "label": "Xã Nhơn Phú"
      },
      {
        "id": "ward_28948",
        "label": "Xã Nhuận Phú Tân"
      },
      {
        "id": "ward_29329",
        "label": "Xã Phong Thạnh"
      },
      {
        "id": "ward_28879",
        "label": "Xã Phú Phụng"
      },
      {
        "id": "ward_29611",
        "label": "Xã Phú Quới"
      },
      {
        "id": "ward_29062",
        "label": "Xã Phú Thuận"
      },
      {
        "id": "ward_28810",
        "label": "Xã Phú Túc"
      },
      {
        "id": "ward_29020",
        "label": "Xã Phước Long"
      },
      {
        "id": "ward_28915",
        "label": "Xã Phước Mỹ Trung"
      },
      {
        "id": "ward_29668",
        "label": "Xã Quới An"
      },
      {
        "id": "ward_29191",
        "label": "Xã Quới Điền"
      },
      {
        "id": "ward_29677",
        "label": "Xã Quới Thiện"
      },
      {
        "id": "ward_29386",
        "label": "Xã Song Lộc"
      },
      {
        "id": "ward_29740",
        "label": "Xã Song Phú"
      },
      {
        "id": "ward_29719",
        "label": "Xã Tam Bình"
      },
      {
        "id": "ward_29335",
        "label": "Xã Tam Ngãi"
      },
      {
        "id": "ward_29278",
        "label": "Xã Tân An"
      },
      {
        "id": "ward_29029",
        "label": "Xã Tân Hào"
      },
      {
        "id": "ward_29371",
        "label": "Xã Tân Hòa"
      },
      {
        "id": "ward_29653",
        "label": "Xã Tân Long Hội"
      },
      {
        "id": "ward_29785",
        "label": "Xã Tân Lược"
      },
      {
        "id": "ward_28840",
        "label": "Xã Tân Phú"
      },
      {
        "id": "ward_29800",
        "label": "Xã Tân Quới"
      },
      {
        "id": "ward_28921",
        "label": "Xã Tân Thành Bình"
      },
      {
        "id": "ward_29167",
        "label": "Xã Tân Thủy"
      },
      {
        "id": "ward_29137",
        "label": "Xã Tân Xuân"
      },
      {
        "id": "ward_29365",
        "label": "Xã Tập Ngãi"
      },
      {
        "id": "ward_29467",
        "label": "Xã Tập Sơn"
      },
      {
        "id": "ward_29221",
        "label": "Xã Thạnh Hải"
      },
      {
        "id": "ward_29227",
        "label": "Xã Thạnh Phong"
      },
      {
        "id": "ward_29182",
        "label": "Xã Thạnh Phú"
      },
      {
        "id": "ward_29104",
        "label": "Xã Thạnh Phước"
      },
      {
        "id": "ward_28969",
        "label": "Xã Thành Thới"
      },
      {
        "id": "ward_29089",
        "label": "Xã Thạnh Trị"
      },
      {
        "id": "ward_29107",
        "label": "Xã Thới Thuận"
      },
      {
        "id": "ward_28861",
        "label": "Xã Tiên Thủy"
      },
      {
        "id": "ward_29341",
        "label": "Xã Tiểu Cần"
      },
      {
        "id": "ward_29836",
        "label": "Xã Trà Côn"
      },
      {
        "id": "ward_29461",
        "label": "Xã Trà Cú"
      },
      {
        "id": "ward_29821",
        "label": "Xã Trà Ôn"
      },
      {
        "id": "ward_29683",
        "label": "Xã Trung Hiệp"
      },
      {
        "id": "ward_29698",
        "label": "Xã Trung Ngãi"
      },
      {
        "id": "ward_29659",
        "label": "Xã Trung Thành"
      },
      {
        "id": "ward_29431",
        "label": "Xã Vinh Kim"
      },
      {
        "id": "ward_28894",
        "label": "Xã Vĩnh Thành"
      },
      {
        "id": "ward_29845",
        "label": "Xã Vĩnh Xuân"
      }
    ]
  }
];

const POST_2025_BY_ID = new Map(POST_2025_ADMINISTRATIVE_UNITS.map(province => [province.id, province]));
const COMPATIBLE_WARD_SOURCE_IDS: Record<string, string> = {
  thua_thien_hue: 'hue'
};

export const VIETNAM_ADMINISTRATIVE_UNITS: VietnamAdministrativeProvince[] = VIETNAM_PROVINCES_64.map(province => ({
  ...province,
  wards: POST_2025_BY_ID.get(province.id)?.wards
    || POST_2025_BY_ID.get(COMPATIBLE_WARD_SOURCE_IDS[province.id])?.wards
    || []
}));
