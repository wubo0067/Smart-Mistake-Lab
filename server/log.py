'''
Author: calm.wu wubo0067@hotmail.com
Date: 2026-07-03 09:00:05
LastEditors: calm.wu
LastEditTime: 2026-09-17 20:33:24
FilePath: /Smart-Mistake-Lab/server/log.py
Description: 日志模块，提供统一的日志记录接口，支持控制台输出和文件滚动存储。

Copyright (c) 2026 by ${git_name_email}, All Rights Reserved.
'''

import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(__file__), '..', 'logs')
LOG_FILE = os.path.join(LOG_DIR, 'server.log')

# 创建日志文件夹
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FORMAT = '%(asctime)s | %(levelname)-7s | %(filename)s:%(lineno)d | %(name)s | %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'


def setup_logger(name: str = 'smart-mistake-lab') -> logging.Logger:
    logger = logging.getLogger(name)

    # 避免重复添加 handler
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)

    # 控制台 handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(console_handler)

    # 文件 handler（滚动存储，单文件最大 10MB，保留 5 个备份）
    file_handler = RotatingFileHandler(
        LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(file_handler)

    return logger


# 全局 logger 实例
logger = setup_logger()
