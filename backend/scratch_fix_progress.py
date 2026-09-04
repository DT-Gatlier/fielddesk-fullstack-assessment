import re
with open('app/main.py', 'r') as f:
    content = f.read()

pattern = re.compile(r'    background_tasks\.add_task\(emit_work_order_update, str\(current_user\.organisation_id\)\)\n    return schemas\.ProgressEventResponse\.model_validate\(new_event\)')
replacement = '''    db.refresh(db_work_order)
    wo_response = schemas.WorkOrderResponse.model_validate(db_work_order)
    background_tasks.add_task(emit_work_order_update, str(current_user.organisation_id), wo_response.model_dump(mode="json"))
    return schemas.ProgressEventResponse.model_validate(new_event)'''
content = pattern.sub(replacement, content)

with open('app/main.py', 'w') as f:
    f.write(content)
print('Done')
