// Copyright 2022 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const UsernameXpaths = [
  "//input[contains(@id,'username')]",
  "//input[contains(@name,'username')]",
  "//input[contains(@name,'account')]",
  "//input[contains(@name,'login')]",
  "//input[contains(@placeholder,'username')]",
  "//input[contains(@placeholder,'用户名')]",
  "//input[contains(@placeholder,'账号')]",
  "//input[contains(@id,'phone')]",
  "//input[contains(@name,'phone')]",
  "//input[contains(@placeholder,'phone')]",
  "//input[contains(@placeholder,'手机')]",
  "//input[contains(@id,'email')]",
  "//input[contains(@name,'email')]",
  "//input[contains(@placeholder,'email')]",
  "//input[contains(@placeholder,'邮箱')]",
];

const PasswordXpaths = [
  "//input[@type='password']",
  "//input[contains(@id,'password')]",
  "//input[contains(@name,'password')]",
  "//input[contains(@placeholder,'password')]",
  "//input[contains(@placeholder,'密码')]",
];

const SubmitXpaths = [
  "//button[@type='submit']",
  "//input[contains(@name,'commit')]",
  "//button[contains(string(),'Login')]",
  "//button[contains(string(),'Sign in')]",
  "//button[contains(string(),'登录')]",
];
